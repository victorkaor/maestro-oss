"use client";

import type { NodeProps } from "@xyflow/react";
import { useState } from "react";
import type { BrowserPortalData, CanvasNode } from "@/store/canvas-store";
import { useCanvasStore } from "@/store/canvas-store";

export function BrowserPortalNode({ id, data }: NodeProps<CanvasNode>) {
  const portalData = data as BrowserPortalData;
  const browserAction = useCanvasStore((s) => s.browserAction);
  const [url, setUrl] = useState(portalData.url ?? "https://example.com");

  return (
    <div className="w-96 rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg">
      <div className="flex gap-1 border-b border-[var(--border)] p-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
        />
        <button
          onClick={() => browserAction(id, { kind: "navigate", url })}
          className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium text-black"
        >
          Go
        </button>
        <button
          onClick={() => browserAction(id, { kind: "screenshot" })}
          className="rounded border border-[var(--border)] px-2 py-1 text-xs"
        >
          ↻
        </button>
      </div>
      <div className="flex h-56 items-center justify-center bg-black/30">
        {portalData.screenshot ? (
          <img src={portalData.screenshot} alt="browser portal" className="max-h-full max-w-full" />
        ) : (
          <span className="text-xs text-neutral-500">
            {portalData.error ?? "No screenshot yet"}
          </span>
        )}
      </div>
    </div>
  );
}
