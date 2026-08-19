"use client";

import type { NodeProps } from "@xyflow/react";
import type { CanvasNode, StickyNoteData } from "@/store/canvas-store";
import { useCanvasStore } from "@/store/canvas-store";

export function StickyNoteNode({ id, data }: NodeProps<CanvasNode>) {
  const noteData = data as StickyNoteData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  return (
    <div className="h-40 w-48 rounded-md bg-yellow-200 p-3 text-black shadow-lg">
      <textarea
        value={noteData.text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        className="h-full w-full resize-none bg-transparent text-sm outline-none placeholder:text-yellow-800/50"
        placeholder="Note…"
      />
    </div>
  );
}
