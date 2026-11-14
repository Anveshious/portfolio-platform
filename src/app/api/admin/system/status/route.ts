import { adminRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getServerEnv } from "@/lib/config/env";
import { createAdminClient } from "@/lib/database/clients";
import { createOctokitClient } from "@/lib/github/client";

async function probe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Backend health, DB connectivity and GitHub integration status. Admin only. */
export const GET = adminRoute(async () => {
  const env = getServerEnv();
  const db = createAdminClient();
  const [database, github, lastSync] = await Promise.all([
    probe(async () => { const { error } = await db.from("admin_users").select("id", { head: true, count: "exact" }); if (error) throw new Error(error.message); return true; }),
    probe(() => createOctokitClient(env.GITHUB_API_TOKEN).getRateLimit()),
    probe(async () => (await db.from("github_sync_runs").select("status, started_at, finished_at").order("started_at", { ascending: false }).limit(1)).data?.[0] ?? null),
  ]);
  return ok({
    database,
    github: { ...github, authenticated: Boolean(env.GITHUB_API_TOKEN) },
    lastSync,
    config: { webhookSecretSet: Boolean(env.GITHUB_WEBHOOK_SECRET), cronSecretSet: Boolean(env.CRON_SECRET) },
  });
});
