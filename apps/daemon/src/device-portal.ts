import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { DeviceAction, DeviceKind, DeviceResult } from "@maestro-oss/shared";

const exec = promisify(execFile);

function execBuffer(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 32 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

interface DeviceSession {
  kind: DeviceKind;
  udid?: string | undefined;
}

/**
 * Controls iOS Simulators (via `xcrun simctl`, tap/type require the optional
 * `idb` tool — https://github.com/facebook/idb) and Android emulators/physical
 * devices (via `adb`, USB or WiFi debugging — no extra SDK needed).
 *
 * Physical iOS devices are intentionally unsupported: there is no public,
 * unsigned API to drive a real iPhone's UI. Use the iOS Simulator instead.
 */
export class DevicePortalManager {
  private sessions = new Map<string, DeviceSession>();

  async handleAction(nodeId: string, action: DeviceAction): Promise<DeviceResult> {
    try {
      if (action.kind === "boot") {
        this.sessions.set(nodeId, { kind: action.deviceKind, udid: action.udid });
        if (action.deviceKind === "ios_sim") {
          const udid = action.udid ?? "booted";
          await this.tryExec("xcrun", ["simctl", "boot", udid]);
        } else {
          const { stdout } = await exec("adb", ["devices"]);
          if (!stdout.split("\n").slice(1).some((l) => l.trim().endsWith("device"))) {
            throw new Error("No adb device connected (check `adb devices`)");
          }
        }
        return { nodeId, action };
      }

      const session = this.sessions.get(nodeId);
      if (!session) {
        throw new Error("Device not booted for this node — send a 'boot' action first");
      }

      if (session.kind === "ios_sim") {
        return await this.handleIosAction(nodeId, action, session.udid ?? "booted");
      }
      return await this.handleAndroidAction(nodeId, action, session.udid);
    } catch (err) {
      return { nodeId, action, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async tryExec(bin: string, args: string[]): Promise<void> {
    try {
      await exec(bin, args);
    } catch {
      // e.g. "already booted" — non-fatal for our purposes
    }
  }

  private async handleIosAction(
    nodeId: string,
    action: DeviceAction,
    udid: string,
  ): Promise<DeviceResult> {
    switch (action.kind) {
      case "screenshot": {
        const dir = await mkdtemp(join(tmpdir(), "maestro-ios-"));
        const path = join(dir, "shot.png");
        await exec("xcrun", ["simctl", "io", udid, "screenshot", path]);
        const buf = await readFile(path);
        await rm(dir, { recursive: true, force: true });
        return {
          nodeId,
          action,
          screenshot: `data:image/png;base64,${buf.toString("base64")}`,
        };
      }
      case "launchApp":
        await exec("xcrun", ["simctl", "launch", udid, action.bundleId]);
        return { nodeId, action };
      case "tap":
      case "typeText":
        throw new Error(
          "Tap/type on iOS Simulator requires the optional `idb` tool (not installed). " +
            "See README device-control section.",
        );
      default:
        throw new Error(`Unsupported iOS action: ${action.kind}`);
    }
  }

  private async handleAndroidAction(
    nodeId: string,
    action: DeviceAction,
    udid: string | undefined,
  ): Promise<DeviceResult> {
    const serialArgs = udid ? ["-s", udid] : [];
    switch (action.kind) {
      case "screenshot": {
        const stdout = await execBuffer("adb", [...serialArgs, "exec-out", "screencap", "-p"]);
        return {
          nodeId,
          action,
          screenshot: `data:image/png;base64,${stdout.toString("base64")}`,
        };
      }
      case "tap":
        await exec("adb", [
          ...serialArgs,
          "shell",
          "input",
          "tap",
          String(action.x),
          String(action.y),
        ]);
        return { nodeId, action };
      case "typeText":
        await exec("adb", [
          ...serialArgs,
          "shell",
          "input",
          "text",
          action.text.replace(/\s/g, "%s"),
        ]);
        return { nodeId, action };
      case "launchApp":
        await exec("adb", [
          ...serialArgs,
          "shell",
          "monkey",
          "-p",
          action.bundleId,
          "-c",
          "android.intent.category.LAUNCHER",
          "1",
        ]);
        return { nodeId, action };
      default:
        throw new Error(`Unsupported Android action: ${action.kind}`);
    }
  }
}
