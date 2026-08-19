-- The app never created rows in `agents` — every write path uses the canvas
-- node's own id as "agentId" (see apps/web/store/canvas-store.ts, which sets
-- agentId: node.id when spawning). `agents` was dead indirection: its columns
-- duplicate what's already stored in canvas_nodes.data, and messages/routines
-- RLS silently rejected every insert because the join through `agents` never
-- matched anything. Point the FKs at canvas_nodes directly and drop the table.

drop policy if exists "messages_owner_all" on messages;
drop policy if exists "routines_owner_all" on routines;
drop policy if exists "agents_owner_all" on agents;

alter table messages drop constraint if exists messages_agent_id_fkey;
alter table routines drop constraint if exists routines_agent_id_fkey;

alter table messages rename column agent_id to node_id;
alter table routines rename column agent_id to node_id;

alter table messages
  add constraint messages_node_id_fkey foreign key (node_id) references canvas_nodes (id) on delete cascade;
alter table routines
  add constraint routines_node_id_fkey foreign key (node_id) references canvas_nodes (id) on delete cascade;

alter index if exists messages_agent_idx rename to messages_node_idx;
alter index if exists routines_agent_idx rename to routines_node_idx;

drop table if exists agents;

create policy "messages_owner_all" on messages
  for all using (
    exists (
      select 1 from canvas_nodes n
      join workspaces w on w.id = n.workspace_id
      where n.id = messages.node_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from canvas_nodes n
      join workspaces w on w.id = n.workspace_id
      where n.id = messages.node_id and w.owner_id = auth.uid()
    )
  );

create policy "routines_owner_all" on routines
  for all using (
    exists (
      select 1 from canvas_nodes n
      join workspaces w on w.id = n.workspace_id
      where n.id = routines.node_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from canvas_nodes n
      join workspaces w on w.id = n.workspace_id
      where n.id = routines.node_id and w.owner_id = auth.uid()
    )
  );
