import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { createAdminClient } from "@/lib/database/clients";
import { createOctokitClient } from "@/lib/github/client";
import { createSupabaseGithubStore, createSupabaseWebhookStore } from "@/lib/github/store";
import { runSync, type SyncTrigger } from "@/lib/github/sync";

/** Composition root: wires the real Octokit client and Supabase store. Server only. */
export function buildGithubDeps() {
  const env = getServerEnv();
  const db = createAdminClient();
  return {
    env,
    db,
    client: createOctokitClient(env.GITHUB_API_TOKEN),
    store: createSupabaseGithubStore(db),
    events: createSupabaseWebhookStore(db),
  };
}

export async function syncGithub(trigger: SyncTrigger) {
  const { env, client, store } = buildGithubDeps();
  return runSync({ client, store }, { ownerGithubId: Number(env.ADMIN_GITHUB_ID), trigger });
}
