import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge as rfAddEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import { create } from "zustand";
import type {
  AgentKind,
  AgentStatus,
  BrowserAction,
  DeviceAction,
  DeviceKind,
  ServerMessage,
} from "@maestro-oss/shared";
import { createClient } from "@/lib/supabase/client";
import { connectDaemon, type DaemonSocket } from "@/lib/daemon-socket";

export interface TranscriptEntry {
  role: "user" | "agent" | "system";
  content: string;
}

export interface AgentTerminalData extends Record<string, unknown> {
  kind: "agent_terminal";
  label: string;
  agentKind: AgentKind;
  cliCommand?: string;
  model?: string;
  systemPrompt?: string;
  role?: string;
  status: AgentStatus;
  transcript: TranscriptEntry[];
  liveBuffer: string;
}

export interface StickyNoteData extends Record<string, unknown> {
  kind: "sticky_note";
  text: string;
}

export interface BrowserPortalData extends Record<string, unknown> {
  kind: "browser_portal";
  url?: string;
  screenshot?: string;
  error?: string;
}

export interface DevicePortalData extends Record<string, unknown> {
  kind: "device_portal";
  deviceKind: DeviceKind;
  udid?: string;
  screenshot?: string;
  error?: string;
}

export type CanvasNodeData =
  | AgentTerminalData
  | StickyNoteData
  | BrowserPortalData
  | DevicePortalData;

export type CanvasNode = Node<CanvasNodeData>;

interface CanvasState {
  workspaceId: string | null;
  nodes: CanvasNode[];
  edges: Edge[];
  daemonStatus: "disconnected" | "connecting" | "connected";
  daemon: DaemonSocket | null;

  init: (workspaceId: string, nodes: CanvasNode[], edges: Edge[]) => Promise<void>;
  teardown: () => void;

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  addNode: (data: CanvasNodeData, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, patch: Partial<CanvasNodeData>) => void;
  persistNode: (nodeId: string) => void;

  sendAgentInput: (nodeId: string, content: string) => void;
  stopAgent: (nodeId: string) => void;
  upsertRoutine: (routineId: string, agentId: string, cronExpr: string, prompt: string, enabled: boolean) => void;
  deleteRoutine: (routineId: string) => void;
  browserAction: (nodeId: string, action: BrowserAction) => void;
  deviceAction: (nodeId: string, action: DeviceAction) => void;
  subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) => void;
}

// Guards init()/teardown() against React's dev-mode double-invoked effects — see init()'s comment.
let connectionGeneration = 0;

function handleServerMessage(get: () => CanvasState, set: (fn: (s: CanvasState) => Partial<CanvasState>) => void, msg: ServerMessage): void {
  switch (msg.type) {
    case "auth.ok":
      set(() => ({ daemonStatus: "connected" }));
      return;

    case "agent.output": {
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== msg.agentId || n.data.kind !== "agent_terminal") return n;
          const data = n.data;
          if (msg.stream === "assistant" || msg.stream === "stdout") {
            return { ...n, data: { ...data, liveBuffer: data.liveBuffer + msg.chunk } };
          }
          return {
            ...n,
            data: {
              ...data,
              transcript: [...data.transcript, { role: "system", content: msg.chunk }],
            },
          };
        }),
      }));
      return;
    }

    case "agent.status": {
      const finishing = msg.status === "idle" || msg.status === "stopped" || msg.status === "error";
      set((s) => {
        let handoffText: string | null = null;
        const nodes = s.nodes.map((n) => {
          if (n.id !== msg.agentId || n.data.kind !== "agent_terminal") return n;
          const data = n.data;
          if (finishing && data.liveBuffer) {
            handoffText = data.liveBuffer;
            return {
              ...n,
              data: {
                ...data,
                status: msg.status,
                liveBuffer: "",
                transcript: [...data.transcript, { role: "agent" as const, content: data.liveBuffer }],
              },
            };
          }
          return { ...n, data: { ...data, status: msg.status } };
        });

        if (handoffText) {
          const targets = s.edges.filter((e) => e.source === msg.agentId).map((e) => e.target);
          for (const targetId of targets) {
            s.daemon?.send({ type: "agent.input", agentId: targetId, content: handoffText });
          }
        }

        return { nodes };
      });
      return;
    }

    case "browser.result": {
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === msg.result.nodeId && n.data.kind === "browser_portal"
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...(msg.result.screenshot !== undefined && { screenshot: msg.result.screenshot }),
                  ...(msg.result.url !== undefined && { url: msg.result.url }),
                  ...(msg.result.error !== undefined && { error: msg.result.error }),
                },
              }
            : n,
        ),
      }));
      return;
    }

    case "device.result": {
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === msg.result.nodeId && n.data.kind === "device_portal"
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...(msg.result.screenshot !== undefined && { screenshot: msg.result.screenshot }),
                  ...(msg.result.error !== undefined && { error: msg.result.error }),
                },
              }
            : n,
        ),
      }));
      return;
    }

    case "routine.fired":
    case "error":
      console.log("[daemon]", msg);
      return;
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  workspaceId: null,
  nodes: [],
  edges: [],
  daemonStatus: "disconnected",
  daemon: null,

  init: async (workspaceId, nodes, edges) => {
    // React (dev/StrictMode) mounts this effect twice back-to-back; the
    // first mount's async setup can resolve *after* its own cleanup already
    // ran. A generation token lets a superseded init() notice and bail
    // instead of clobbering the connection a later init() just made.
    const myGeneration = ++connectionGeneration;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || myGeneration !== connectionGeneration) return;

    set(() => ({ workspaceId, nodes, edges, daemonStatus: "connecting" }));

    const daemon = connectDaemon({
      token: session.access_token,
      workspaceId,
      onMessage: (msg) => handleServerMessage(get, set, msg),
      onClose: () => set(() => ({ daemonStatus: "disconnected" })),
    });

    if (myGeneration !== connectionGeneration) {
      daemon.close();
      return;
    }
    set(() => ({ daemon }));

    for (const node of nodes) {
      if (node.data.kind === "agent_terminal") {
        daemon.send({
          type: "agent.spawn",
          agentId: node.id,
          nodeId: node.id,
          kind: node.data.agentKind,
          ...(node.data.cliCommand !== undefined && { cliCommand: node.data.cliCommand }),
          ...(node.data.model !== undefined && { model: node.data.model }),
          ...(node.data.systemPrompt !== undefined && { systemPrompt: node.data.systemPrompt }),
          ...(node.data.role !== undefined && { role: node.data.role }),
        });
      }
    }
  },

  teardown: () => {
    connectionGeneration++;
    get().daemon?.close();
    set(() => ({ daemon: null, daemonStatus: "disconnected", nodes: [], edges: [], workspaceId: null }));
  },

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (connection) => {
    set((s) => ({ edges: rfAddEdge(connection, s.edges) }));
    const workspaceId = get().workspaceId;
    if (!workspaceId || !connection.source || !connection.target) return;
    void createClient()
      .from("canvas_edges")
      .insert({ workspace_id: workspaceId, source_node_id: connection.source, target_node_id: connection.target })
      .then(({ error }) => error && console.error("[canvas] persist edge failed", error));
  },

  addNode: (data, position) => {
    const id = crypto.randomUUID();
    const node: CanvasNode = { id, type: data.kind, position, data };
    set((s) => ({ nodes: [...s.nodes, node] }));
    get().persistNode(id);

    if (data.kind === "agent_terminal") {
      get().daemon?.send({
        type: "agent.spawn",
        agentId: id,
        nodeId: id,
        kind: data.agentKind,
        ...(data.cliCommand !== undefined && { cliCommand: data.cliCommand }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
        ...(data.role !== undefined && { role: data.role }),
      });
    }
  },

  updateNodeData: (nodeId, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } as CanvasNodeData } : n)),
    }));
    get().persistNode(nodeId);
  },

  persistNode: (nodeId) => {
    const workspaceId = get().workspaceId;
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!workspaceId || !node) return;
    void createClient()
      .from("canvas_nodes")
      .upsert({
        id: node.id,
        workspace_id: workspaceId,
        type: node.data.kind,
        position: node.position,
        data: node.data,
      })
      .then(({ error }) => error && console.error("[canvas] persist node failed", error));
  },

  sendAgentInput: (nodeId, content) => {
    get().daemon?.send({ type: "agent.input", agentId: nodeId, content });
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId && n.data.kind === "agent_terminal"
          ? { ...n, data: { ...n.data, transcript: [...n.data.transcript, { role: "user", content }] } }
          : n,
      ),
    }));
  },

  stopAgent: (nodeId) => get().daemon?.send({ type: "agent.stop", agentId: nodeId }),

  upsertRoutine: (routineId, agentId, cronExpr, prompt, enabled) =>
    get().daemon?.send({ type: "routine.upsert", routineId, agentId, cronExpr, prompt, enabled }),

  deleteRoutine: (routineId) => get().daemon?.send({ type: "routine.delete", routineId }),

  browserAction: (nodeId, action) => get().daemon?.send({ type: "browser.action", nodeId, action }),

  deviceAction: (nodeId, action) => get().daemon?.send({ type: "device.action", nodeId, action }),

  subscribePush: (subscription) => get().daemon?.send({ type: "push.subscribe", subscription }),
}));
