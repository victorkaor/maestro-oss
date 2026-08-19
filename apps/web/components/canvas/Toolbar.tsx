"use client";

import { useCanvasStore } from "@/store/canvas-store";
import { subscribeToPush } from "@/lib/push";

function randomPosition() {
  return { x: 80 + Math.random() * 300, y: 80 + Math.random() * 300 };
}

export function Toolbar() {
  const addNode = useCanvasStore((s) => s.addNode);
  const subscribePush = useCanvasStore((s) => s.subscribePush);

  function addCliAgent() {
    const label = window.prompt("Agent label", "Claude") ?? "Agent";
    const cliCommand = window.prompt("CLI command", "claude") ?? "claude";
    addNode(
      {
        kind: "agent_terminal",
        label,
        agentKind: "cli",
        cliCommand,
        status: "idle",
        transcript: [],
        liveBuffer: "",
      },
      randomPosition(),
    );
  }

  function addApiAgent() {
    const label = window.prompt("Agent label", "Researcher") ?? "Agent";
    const systemPrompt = window.prompt("System prompt (optional)", "") ?? undefined;
    addNode(
      {
        kind: "agent_terminal",
        label,
        agentKind: "api",
        status: "idle",
        transcript: [],
        liveBuffer: "",
        ...(systemPrompt ? { systemPrompt } : {}),
      },
      randomPosition(),
    );
  }

  function addStickyNote() {
    addNode({ kind: "sticky_note", text: "" }, randomPosition());
  }

  function addBrowserPortal() {
    addNode({ kind: "browser_portal" }, randomPosition());
  }

  function addDevicePortal(deviceKind: "ios_sim" | "android") {
    addNode({ kind: "device_portal", deviceKind }, randomPosition());
  }

  async function enablePush() {
    const subscription = await subscribeToPush();
    if (subscription) subscribePush(subscription);
  }

  return (
    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
      {[
        ["+ CLI agent", addCliAgent],
        ["+ API agent", addApiAgent],
        ["+ Sticky note", addStickyNote],
        ["+ Browser portal", addBrowserPortal],
        ["+ iOS sim", () => addDevicePortal("ios_sim")],
        ["+ Android", () => addDevicePortal("android")],
        ["Enable push", enablePush],
      ].map(([label, fn]) => (
        <button
          key={label as string}
          onClick={fn as () => void}
          className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
        >
          {label as string}
        </button>
      ))}
    </div>
  );
}
