import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type CoreMessage } from "ai";
import type { AgentRunner, AgentRunnerCallbacks } from "./process-manager.js";

export interface ApiAgentOptions {
  model?: string | undefined;
  systemPrompt?: string | undefined;
}

const DEFAULT_MODEL = "claude-sonnet-4-5";

export function spawnApiAgent(
  options: ApiAgentOptions,
  callbacks: AgentRunnerCallbacks,
): AgentRunner {
  const history: CoreMessage[] = [];
  let busy = false;

  callbacks.onStatus("idle");

  const send = (content: string): void => {
    if (busy) {
      callbacks.onOutput("system", "Agent is still responding, ignoring input.\n");
      return;
    }
    history.push({ role: "user", content });
    busy = true;
    callbacks.onStatus("running");

    void (async () => {
      try {
        const result = streamText({
          model: anthropic(options.model ?? DEFAULT_MODEL),
          messages: history,
          ...(options.systemPrompt !== undefined ? { system: options.systemPrompt } : {}),
        });

        let full = "";
        for await (const delta of result.textStream) {
          full += delta;
          callbacks.onOutput("assistant", delta);
        }
        history.push({ role: "assistant", content: full });
        busy = false;
        callbacks.onStatus("idle");
      } catch (err) {
        busy = false;
        callbacks.onStatus("error", err instanceof Error ? err.message : String(err));
      }
    })();
  };

  return {
    send,
    stop: () => {
      history.length = 0;
      callbacks.onStatus("stopped");
    },
  };
}
