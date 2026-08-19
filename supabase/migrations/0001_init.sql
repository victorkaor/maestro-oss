-- maestro-oss core schema. Owner-scoped RLS: a row is visible/writable only to
-- the workspace's owner (auth.uid() = workspaces.owner_id), reached via joins.

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists canvas_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  type text not null check (type in ('agent_terminal', 'sticky_note', 'browser_portal', 'device_portal')),
  position jsonb not null default '{"x":0,"y":0}',
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists canvas_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  source_node_id uuid not null references canvas_nodes (id) on delete cascade,
  target_node_id uuid not null references canvas_nodes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references canvas_nodes (id) on delete cascade,
  kind text not null check (kind in ('cli', 'api')),
  provider text,
  model text,
  role text,
  system_prompt text,
  cli_command text,
  status text not null default 'idle' check (status in ('idle', 'starting', 'running', 'error', 'stopped')),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents (id) on delete cascade,
  role text not null check (role in ('user', 'agent', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents (id) on delete cascade,
  cron_expr text not null,
  prompt text not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('ios_sim', 'android')),
  udid text,
  status text not null default 'offline',
  created_at timestamptz not null default now()
);

create index if not exists canvas_nodes_workspace_idx on canvas_nodes (workspace_id);
create index if not exists canvas_edges_workspace_idx on canvas_edges (workspace_id);
create index if not exists agents_node_idx on agents (node_id);
create index if not exists messages_agent_idx on messages (agent_id, created_at);
create index if not exists routines_agent_idx on routines (agent_id);
create index if not exists devices_workspace_idx on devices (workspace_id);

alter table workspaces enable row level security;
alter table canvas_nodes enable row level security;
alter table canvas_edges enable row level security;
alter table agents enable row level security;
alter table messages enable row level security;
alter table routines enable row level security;
alter table push_subscriptions enable row level security;
alter table devices enable row level security;

create policy "workspaces_owner_all" on workspaces
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "canvas_nodes_owner_all" on canvas_nodes
  for all using (
    exists (select 1 from workspaces w where w.id = canvas_nodes.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from workspaces w where w.id = canvas_nodes.workspace_id and w.owner_id = auth.uid())
  );

create policy "canvas_edges_owner_all" on canvas_edges
  for all using (
    exists (select 1 from workspaces w where w.id = canvas_edges.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from workspaces w where w.id = canvas_edges.workspace_id and w.owner_id = auth.uid())
  );

create policy "agents_owner_all" on agents
  for all using (
    exists (
      select 1 from canvas_nodes n
      join workspaces w on w.id = n.workspace_id
      where n.id = agents.node_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from canvas_nodes n
      join workspaces w on w.id = n.workspace_id
      where n.id = agents.node_id and w.owner_id = auth.uid()
    )
  );

create policy "messages_owner_all" on messages
  for all using (
    exists (
      select 1 from agents a
      join canvas_nodes n on n.id = a.node_id
      join workspaces w on w.id = n.workspace_id
      where a.id = messages.agent_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from agents a
      join canvas_nodes n on n.id = a.node_id
      join workspaces w on w.id = n.workspace_id
      where a.id = messages.agent_id and w.owner_id = auth.uid()
    )
  );

create policy "routines_owner_all" on routines
  for all using (
    exists (
      select 1 from agents a
      join canvas_nodes n on n.id = a.node_id
      join workspaces w on w.id = n.workspace_id
      where a.id = routines.agent_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from agents a
      join canvas_nodes n on n.id = a.node_id
      join workspaces w on w.id = n.workspace_id
      where a.id = routines.agent_id and w.owner_id = auth.uid()
    )
  );

create policy "push_subscriptions_owner_all" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "devices_owner_all" on devices
  for all using (
    exists (select 1 from workspaces w where w.id = devices.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from workspaces w where w.id = devices.workspace_id and w.owner_id = auth.uid())
  );
