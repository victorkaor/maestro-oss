import { WebSocketServer, type WebSocket } from "ws";
import {
  parseClientMessage,
  type AgentKind,
  type AgentStatus,
  type ServerMessage,
} from "@maestro-oss/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { verifyToken, createUserScopedClient } from "./supabase-client.js";
import { spawnCliAgent, type AgentRunner } from "./process-manager.js";
import { spawnApiAgent } from "./api-agent-runner.js";
import { RoutineScheduler } from "./routine-scheduler.js";
import { BrowserPortalManager } from "./browser-portal.js";
import { DevicePortalManager } from "./device-portal.js";
import { sendPush } from "./push-dispatcher.js";

interface Session {
  userId: string;
  workspaceId: string;
  supabase: SupabaseClient;
  runners: Map<string, AgentRunner>;
  agentKind: Map<string, AgentKind>;
  buffers: Map<string, string>;
  scheduler: RoutineScheduler;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

export function startWsGateway(): void {
  const wss = new WebSocketServer({ port: config.port });
  const browserPortal = new BrowserPortalManager();
  const devicePortal = new DevicePortalManager();

  wss.on("connection", (ws) => {
    let session: Session | undefined;

    ws.on("message", (raw) => {
      void (async () => {
        let msg;
        try {
          msg = parseClientMessage(JSON.parse(raw.toString()));
        } catch (err) {
          send(ws, { type: "error", message: `Bad message: ${err instanceof Error ? err.message : String(err)}` });
          return;
        }

        if (msg.type === "auth") {
          const verified = await verifyToken(msg.token);
          if (!verified) {
            send(ws, { type: "error", message: "Invalid or expired token", code: "auth" });
            ws.close();
            return;
          }
          session = {
            userId: verified.userId,
            workspaceId: msg.workspaceId,
            supabase: createUserScopedClient(msg.token),
            runners: new Map(),
            agentKind: new Map(),
            buffers: new Map(),
            scheduler: new RoutineScheduler({
              getSend: (agentId) => session?.runners.get(agentId)?.send,
              onFired: (routineId, agentId, at) => {
                send(ws, { type: "routine.fired", routineId, agentId, at });
              },
              onLastRun: (routineId, at) => {
                void session?.supabase
                  .from("routines")
                  .update({ last_run_at: at })
                  .eq("id", routineId);
              },
            }),
          };
          send(ws, { type: "auth.ok" });
          return;
        }

        if (!session) {
          send(ws, { type: "error", message: "Not authenticated", code: "auth" });
          return;
        }

        await handleMessage(session, msg, ws, browserPortal, devicePortal);
      })();
    });

    ws.on("close", () => {
      if (!session) return;
      for (const runner of session.runners.values()) runner.stop();
      session.scheduler.stopAll();
    });
  });

  console.log(`[daemon] WS gateway listening on ws://localhost:${config.port}`);
}

async function handleMessage(
  session: Session,
  msg: ReturnType<typeof parseClientMessage>,
  ws: WebSocket,
  browserPortal: BrowserPortalManager,
  devicePortal: DevicePortalManager,
): Promise<void> {
  switch (msg.type) {
    case "agent.spawn": {
      const callbacks = {
        onOutput: (stream: "stdout" | "stderr" | "assistant" | "system", chunk: string) => {
          send(ws, { type: "agent.output", agentId: msg.agentId, stream, chunk });
          if (msg.kind === "cli" && (stream === "stdout")) {
            void session.supabase
              .from("messages")
              .insert({ agent_id: msg.agentId, role: "agent", content: chunk })
              .then(({ error }) => error && console.error("[daemon] persist chunk failed", error));
          } else if (msg.kind === "api" && stream === "assistant") {
            session.buffers.set(msg.agentId, (session.buffers.get(msg.agentId) ?? "") + chunk);
          }
        },
        onStatus: (status: AgentStatus, error?: string) => {
          send(ws, { type: "agent.status", agentId: msg.agentId, status, error });
          if (msg.kind === "api" && (status === "idle" || status === "stopped" || status === "error")) {
            const buffered = session.buffers.get(msg.agentId);
            if (buffered) {
              session.buffers.delete(msg.agentId);
              void session.supabase
                .from("messages")
                .insert({ agent_id: msg.agentId, role: "agent", content: buffered })
                .then(({ error: e }) => e && console.error("[daemon] persist message failed", e));
            }
          }
          void session.supabase.from("agents").update({ status }).eq("id", msg.agentId);
        },
      };

      const runner =
        msg.kind === "cli"
          ? spawnCliAgent(msg.cliCommand ?? config.defaultCliCommand, callbacks)
          : spawnApiAgent({ model: msg.model, systemPrompt: msg.systemPrompt }, callbacks);

      session.runners.set(msg.agentId, runner);
      session.agentKind.set(msg.agentId, msg.kind);
      return;
    }

    case "agent.input": {
      const runner = session.runners.get(msg.agentId);
      if (!runner) {
        send(ws, { type: "error", message: `No running agent ${msg.agentId}` });
        return;
      }
      runner.send(msg.content);
      const { error } = await session.supabase
        .from("messages")
        .insert({ agent_id: msg.agentId, role: "user", content: msg.content });
      if (error) console.error("[daemon] persist input failed", error);
      return;
    }

    case "agent.stop": {
      session.runners.get(msg.agentId)?.stop();
      session.runners.delete(msg.agentId);
      session.agentKind.delete(msg.agentId);
      return;
    }

    case "routine.upsert": {
      try {
        session.scheduler.upsert(msg.routineId, {
          agentId: msg.agentId,
          cronExpr: msg.cronExpr,
          prompt: msg.prompt,
          enabled: msg.enabled,
        });
      } catch (err) {
        send(ws, { type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    case "routine.delete": {
      session.scheduler.remove(msg.routineId);
      return;
    }

    case "browser.action": {
      const result = await browserPortal.handleAction(msg.nodeId, msg.action);
      send(ws, { type: "browser.result", result });
      return;
    }

    case "device.action": {
      const result = await devicePortal.handleAction(msg.nodeId, msg.action);
      send(ws, { type: "device.result", result });
      return;
    }

    case "push.subscribe": {
      const { error } = await session.supabase.from("push_subscriptions").upsert(
        {
          user_id: session.userId,
          endpoint: msg.subscription.endpoint,
          keys: msg.subscription.keys,
        },
        { onConflict: "endpoint" },
      );
      if (error) send(ws, { type: "error", message: error.message });
      return;
    }

    case "push.test": {
      const { data, error } = await session.supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", session.userId);
      if (error) {
        send(ws, { type: "error", message: error.message });
        return;
      }
      for (const row of data ?? []) {
        try {
          await sendPush(
            { endpoint: row.endpoint as string, keys: row.keys as { p256dh: string; auth: string } },
            { title: msg.title, body: msg.body },
          );
        } catch (err) {
          send(ws, { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
      return;
    }

    case "auth":
      return; // already handled before dispatch
  }
}
