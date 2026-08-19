import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "./protocol.js";

describe("parseClientMessage", () => {
  it("accepts a valid auth message", () => {
    const msg = parseClientMessage({ type: "auth", token: "t", workspaceId: "w1" });
    expect(msg).toEqual({ type: "auth", token: "t", workspaceId: "w1" });
  });

  it("accepts a device.action boot message", () => {
    const msg = parseClientMessage({
      type: "device.action",
      nodeId: "n1",
      action: { kind: "boot", deviceKind: "android", udid: "emulator-5554" },
    });
    expect(msg.type).toBe("device.action");
  });

  it("rejects an unknown message type", () => {
    expect(() => parseClientMessage({ type: "bogus" })).toThrow();
  });

  it("rejects a browser.action with an invalid url", () => {
    expect(() =>
      parseClientMessage({
        type: "browser.action",
        nodeId: "n1",
        action: { kind: "navigate", url: "not-a-url" },
      }),
    ).toThrow();
  });
});

describe("parseServerMessage", () => {
  it("accepts a valid agent.status message", () => {
    const msg = parseServerMessage({ type: "agent.status", agentId: "a1", status: "running" });
    expect(msg).toEqual({ type: "agent.status", agentId: "a1", status: "running" });
  });

  it("rejects an invalid status enum value", () => {
    expect(() =>
      parseServerMessage({ type: "agent.status", agentId: "a1", status: "sleeping" }),
    ).toThrow();
  });
});
