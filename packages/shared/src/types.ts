/** DB row shapes mirroring supabase/migrations/0001_init.sql. Kept hand-written and
 * small on purpose — regenerate with `supabase gen types typescript` if the schema
 * grows past what's convenient to hand-maintain. */

export type NodeType =
  | "agent_terminal"
  | "sticky_note"
  | "browser_portal"
  | "device_portal";

export interface CanvasNodeRow {
  id: string;
  workspace_id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  created_at: string;
}

export interface CanvasEdgeRow {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  node_id: string;
  role: "user" | "agent" | "system";
  content: string;
  created_at: string;
}

export interface RoutineRow {
  id: string;
  node_id: string;
  cron_expr: string;
  prompt: string;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  created_at: string;
}

export interface DeviceRow {
  id: string;
  workspace_id: string;
  kind: "ios_sim" | "android";
  udid: string | null;
  status: string;
  created_at: string;
}

export interface WorkspaceRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}
