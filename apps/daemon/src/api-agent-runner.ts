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

        // Iterate fullStream (not textStream) so a provider-level failure
        // (bad model id, no credit, rate limit) surfaces as an "error" part
        // instead of silently ending the stream with no text and no throw.
        let full = "";
        let streamError: unknown;
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            full += part.textDelta;
            callbacks.onOutput("assistant", part.textDelta);
          } else if (part.type === "error") {
            streamError = part.error;
          }
        }
        if (streamError) throw streamError;

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
