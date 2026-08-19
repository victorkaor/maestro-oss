"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState, type KeyboardEvent } from "react";
import type { AgentTerminalData, CanvasNode } from "@/store/canvas-store";
import { useCanvasStore } from "@/store/canvas-store";

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-neutral-500",
  starting: "bg-yellow-500",
  running: "bg-emerald-500 animate-pulse",
  error: "bg-red-500",
  stopped: "bg-neutral-700",
};

export function AgentTerminalNode({ id, data }: NodeProps<CanvasNode>) {
  const agentData = data as AgentTerminalData;
  const sendAgentInput = useCanvasStore((s) => s.sendAgentInput);
  const stopAgent = useCanvasStore((s) => s.stopAgent);
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    sendAgentInput(id, draft);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="w-80 rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[agentData.status] ?? "bg-neutral-500"}`} />
          <span className="text-sm font-medium">{agentData.label}</span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
            {agentData.agentKind}
          </span>
        </div>
        <button onClick={() => stopAgent(id)} className="text-xs text-neutral-500 hover:text-red-400">
          stop
        </button>
      </div>

      <div className="h-48 overflow-y-auto px-3 py-2 text-xs">
        {agentData.transcript.map((entry, i) => (
          <div key={i} className={entry.role === "user" ? "text-neutral-300" : "text-emerald-300"}>
            <span className="text-neutral-600">{entry.role === "user" ? "> " : "· "}</span>
            <span className="whitespace-pre-wrap">{entry.content}</span>
          </div>
        ))}
        {agentData.liveBuffer && (
          <div className="text-emerald-300">
            <span className="text-neutral-600">· </span>
            <span className="whitespace-pre-wrap">{agentData.liveBuffer}</span>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Message this agent…"
          className="w-full resize-none rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
        />
      </div>
    </div>
  );
}
