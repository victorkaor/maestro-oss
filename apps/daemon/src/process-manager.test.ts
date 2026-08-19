import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { spawnCliAgent } from "./process-manager.js";

function writeEchoScript(): string {
  const dir = mkdtempSync(join(tmpdir(), "maestro-test-"));
  const path = join(dir, "echo.js");
  writeFileSync(
    path,
    "process.stdin.on('data', function (d) { process.stdout.write('echo:' + d.toString()); });\n",
  );
  return path;
}

describe("spawnCliAgent", () => {
  it("streams stdout back to the caller for a running process", async () => {
    const onOutput = vi.fn();
    const onStatus = vi.fn();
    const runner = spawnCliAgent(`node ${writeEchoScript()}`, { onOutput, onStatus });

    await new Promise((r) => setTimeout(r, 100));
    runner.send("hello");
    await new Promise((r) => setTimeout(r, 200));

    const stdoutChunks = onOutput.mock.calls.filter((c) => c[0] === "stdout").map((c) => c[1]);
    expect(stdoutChunks.join("")).toContain("echo:hello");

    runner.stop();
  });

  it("reports an error status for a nonexistent binary", async () => {
    const onOutput = vi.fn();
    const onStatus = vi.fn();
    spawnCliAgent("this-binary-does-not-exist-xyz", { onOutput, onStatus });

    await new Promise((r) => setTimeout(r, 100));
    expect(onStatus).toHaveBeenCalledWith("error", expect.any(String));
  });
});
