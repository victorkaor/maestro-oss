import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentStatus, OutputStream } from "@maestro-oss/shared";

export interface AgentRunnerCallbacks {
  onOutput: (stream: OutputStream, chunk: string) => void;
  onStatus: (status: AgentStatus, error?: string) => void;
}

export interface AgentRunner {
  send: (content: string) => void;
  stop: () => void;
}

/** Naive shell-word split — good enough for `claude`, `claude --model x`, etc.
 * Agents needing complex quoting should wrap themselves in a script. */
function splitCommand(command: string): [string, string[]] {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  const [bin, ...args] = parts;
  if (!bin) throw new Error("Empty CLI command");
  return [bin, args];
}

export function spawnCliAgent(
  command: string,
  callbacks: AgentRunnerCallbacks,
): AgentRunner {
  const [bin, args] = splitCommand(command);
  let child: ChildProcessWithoutNullStreams;

  try {
    child = spawn(bin, args, { stdio: "pipe" });
  } catch (err) {
    callbacks.onStatus("error", err instanceof Error ? err.message : String(err));
    return { send: () => {}, stop: () => {} };
  }

  callbacks.onStatus("starting");

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    callbacks.onStatus("running");
    callbacks.onOutput("stdout", chunk);
  });
  child.stderr.on("data", (chunk: string) => {
    callbacks.onOutput("stderr", chunk);
  });
  child.on("error", (err) => {
    callbacks.onStatus("error", err.message);
  });
  child.on("exit", (code) => {
    callbacks.onStatus(code === 0 ? "stopped" : "error", `exited with code ${code}`);
  });

  return {
    send: (content: string) => {
      if (child.stdin.writable) {
        child.stdin.write(content.endsWith("\n") ? content : `${content}\n`);
      }
    },
    stop: () => {
      child.kill();
    },
  };
}
