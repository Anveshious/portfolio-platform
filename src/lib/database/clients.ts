import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/config/env";

/**
 * Three clients, three trust levels:
 *
 *  createPublicClient   anon key, no session    -> RLS limits it to published public rows.
 *                       Used by every /api/public/* route.
 *  createSessionClient  anon key + user cookies -> acts as the signed-in user (auth checks only).
 *  createAdminClient    service-role key        -> BYPASSES RLS. Only used after
 *                       requireAdmin() / webhook signature / cron secret checks.
 */
const baseOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function createPublicClient(): SupabaseClient {
  const env = getPublicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, baseOptions);
}

export function createAdminClient(): SupabaseClient {
  const env = getServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, baseOptions);
}

export async function createSessionClient(): Promise<SupabaseClient> {
  const env = getPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only; middleware refreshes them.
        }
      },
    },
  });
}
