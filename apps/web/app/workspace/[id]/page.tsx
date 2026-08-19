import { notFound, redirect } from "next/navigation";
import type { Edge } from "@xyflow/react";
import type { CanvasEdgeRow, CanvasNodeRow, MessageRow } from "@maestro-oss/shared";
import { createClient } from "@/lib/supabase/server";
import { Canvas } from "@/components/canvas/Canvas";
import type { AgentTerminalData, CanvasNode, CanvasNodeData } from "@/store/canvas-store";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!workspace) notFound();

  const [{ data: nodeRows }, { data: edgeRows }] = await Promise.all([
    supabase.from("canvas_nodes").select("*").eq("workspace_id", workspaceId),
    supabase.from("canvas_edges").select("*").eq("workspace_id", workspaceId),
  ]);

  const rows = (nodeRows ?? []) as CanvasNodeRow[];
  const agentIds = rows.filter((r) => r.type === "agent_terminal").map((r) => r.id);

  let messagesByAgent = new Map<string, MessageRow[]>();
  if (agentIds.length > 0) {
    const { data: messageRows } = await supabase
      .from("messages")
      .select("*")
      .in("agent_id", agentIds)
      .order("created_at", { ascending: true });
    messagesByAgent = new Map();
    for (const row of (messageRows ?? []) as MessageRow[]) {
      const list = messagesByAgent.get(row.agent_id) ?? [];
      list.push(row);
      messagesByAgent.set(row.agent_id, list);
    }
  }

  const initialNodes: CanvasNode[] = rows.map((row) => {
    let data = row.data as CanvasNodeData;
    if (row.type === "agent_terminal") {
      const base = data as AgentTerminalData;
      data = {
        ...base,
        transcript: (messagesByAgent.get(row.id) ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        liveBuffer: "",
        status: "idle",
      };
    }
    return { id: row.id, type: row.type, position: row.position, data };
  });

  const initialEdges: Edge[] = ((edgeRows ?? []) as CanvasEdgeRow[]).map((row) => ({
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
  }));

  return <Canvas workspaceId={workspaceId} initialNodes={initialNodes} initialEdges={initialEdges} />;
}
