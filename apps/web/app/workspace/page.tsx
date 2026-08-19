import Link from "next/link";
import type { WorkspaceRow } from "@maestro-oss/shared";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace, signOut } from "./actions";

export default async function WorkspaceListPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: false });
  const workspaces = (data ?? []) as WorkspaceRow[];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workspaces</h1>
        <form action={signOut}>
          <button className="text-sm text-neutral-400 hover:text-neutral-200">Sign out</button>
        </form>
      </div>

      <form action={createWorkspace} className="mb-8 flex gap-2">
        <input
          name="name"
          required
          placeholder="New workspace name"
          className="flex-1 rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none"
        />
        <button className="rounded bg-[var(--accent)] px-4 py-2 font-medium text-black">
          Create
        </button>
      </form>

      <ul className="space-y-2">
        {workspaces.map((w) => (
          <li key={w.id}>
            <Link
              href={`/workspace/${w.id}`}
              className="block rounded border border-[var(--border)] bg-[var(--panel)] px-4 py-3 hover:border-[var(--accent)]"
            >
              {w.name}
            </Link>
          </li>
        ))}
        {workspaces.length === 0 && (
          <p className="text-sm text-neutral-500">No workspaces yet — create one above.</p>
        )}
      </ul>
    </main>
  );
}
