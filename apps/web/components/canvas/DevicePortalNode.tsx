"use client";

import type { NodeProps } from "@xyflow/react";
import type { MouseEvent } from "react";
import type { CanvasNode, DevicePortalData } from "@/store/canvas-store";
import { useCanvasStore } from "@/store/canvas-store";

export function DevicePortalNode({ id, data }: NodeProps<CanvasNode>) {
  const portalData = data as DevicePortalData;
  const deviceAction = useCanvasStore((s) => s.deviceAction);

  function onScreenClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 390);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 844);
    deviceAction(id, { kind: "tap", x, y });
  }

  return (
    <div className="w-64 rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-xs">
        <span>
          {portalData.deviceKind} {portalData.udid ? `· ${portalData.udid.slice(0, 8)}` : ""}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() =>
              deviceAction(id, { kind: "boot", deviceKind: portalData.deviceKind, udid: portalData.udid })
            }
            className="rounded border border-[var(--border)] px-2 py-0.5"
          >
            boot
          </button>
          <button
            onClick={() => deviceAction(id, { kind: "screenshot" })}
            className="rounded border border-[var(--border)] px-2 py-0.5"
          >
            ↻
          </button>
        </div>
      </div>
      <div
        onClick={onScreenClick}
        className="flex h-72 cursor-crosshair items-center justify-center bg-black/30"
      >
        {portalData.screenshot ? (
          <img src={portalData.screenshot} alt="device portal" className="max-h-full max-w-full" />
        ) : (
          <span className="px-2 text-center text-xs text-neutral-500">
            {portalData.error ?? "Boot device, then screenshot"}
          </span>
        )}
      </div>
    </div>
  );
}
