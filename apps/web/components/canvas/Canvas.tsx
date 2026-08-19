"use client";

import { ReactFlow, Background, Controls, MiniMap, type NodeTypes } from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { AgentTerminalNode } from "./AgentTerminalNode";
import { StickyNoteNode } from "./StickyNoteNode";
import { BrowserPortalNode } from "./BrowserPortalNode";
import { DevicePortalNode } from "./DevicePortalNode";
import { Toolbar } from "./Toolbar";
import type { CanvasNode } from "@/store/canvas-store";
import type { Edge } from "@xyflow/react";

const nodeTypes: NodeTypes = {
  agent_terminal: AgentTerminalNode,
  sticky_note: StickyNoteNode,
  browser_portal: BrowserPortalNode,
  device_portal: DevicePortalNode,
};

export function Canvas({
  workspaceId,
  initialNodes,
  initialEdges,
}: {
  workspaceId: string;
  initialNodes: CanvasNode[];
  initialEdges: Edge[];
}) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const daemonStatus = useCanvasStore((s) => s.daemonStatus);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const init = useCanvasStore((s) => s.init);
  const teardown = useCanvasStore((s) => s.teardown);

  useEffect(() => {
    void init(workspaceId, initialNodes, initialEdges);
    return () => teardown();
  }, [workspaceId, initialNodes, initialEdges, init, teardown]);

  const statusColor = useMemo(
    () => ({ connected: "text-emerald-400", connecting: "text-yellow-400", disconnected: "text-red-400" })[
      daemonStatus
    ],
    [daemonStatus],
  );

  return (
    <div className="h-screen w-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        colorMode="dark"
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <Toolbar />
      <div className={`absolute right-4 top-4 rounded bg-black/50 px-2 py-1 text-xs ${statusColor}`}>
        daemon: {daemonStatus}
      </div>
    </div>
  );
}
