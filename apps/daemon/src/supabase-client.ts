import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/**
 * Per-connection client scoped to the connecting user's JWT (forwarded from the
 * browser on the "auth" WS message). The daemon never holds a service-role key —
 * every DB read/write goes through the same RLS policies the web app uses.
 */
export function createUserScopedClient(accessToken: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function verifyToken(
  accessToken: string,
): Promise<{ userId: string } | null> {
  const client = createUserScopedClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}
