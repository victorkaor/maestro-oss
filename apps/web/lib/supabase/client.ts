import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton: creating a fresh GoTrueClient per call risks racing the session
// hydrated from cookies, and supabase-js warns loudly about duplicate
// instances sharing the same storage key.
let client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
