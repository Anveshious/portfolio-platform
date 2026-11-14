import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingRepository, GithubStore, RepositoryStatus, SyncSummary, SyncTrigger } from "./sync";
import type { WebhookEventStore } from "./webhook";
import type { RepositoryRow } from "./types";

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Supabase adapter. Must be constructed with the service-role client (server only). */
export function createSupabaseGithubStore(db: SupabaseClient): GithubStore {
  return {
    async startRun(trigger: SyncTrigger) {
      const row = check(await db.from("github_sync_runs").insert({ trigger }).select("id").single());
      return row!.id as string;
    },

    async finishRun(runId, s: Omit<SyncSummary, "runId">) {
      check(
        await db
          .from("github_sync_runs")
          .update({
            status: s.status,
            finished_at: new Date().toISOString(),
            repos_seen: s.seen,
            repos_created: s.created,
            repos_updated: s.updated,
            repos_unchanged: s.unchanged,
            repos_missing: s.missing,
            error_message: s.errors.length ? s.errors.join("\n").slice(0, 4000) : null,
          })
          .eq("id", runId),
      );
    },

    async listExisting(): Promise<ExistingRepository[]> {
      const repos = check(await db.from("github_repositories").select("id, github_repository_id, content_hash, status"));
      const linked = check(await db.from("projects").select("github_repository_id").not("github_repository_id", "is", null));
      const linkedIds = new Set((linked as { github_repository_id: string }[]).map((p) => p.github_repository_id));
      return (repos as { id: string; github_repository_id: number; content_hash: string; status: RepositoryStatus }[]).map((r) => ({
        githubRepositoryId: Number(r.github_repository_id),
        contentHash: r.content_hash,
        status: r.status,
        hasLinkedProject: linkedIds.has(r.id),
      }));
    },

    async insertRepository(row: RepositoryRow) {
      const now = new Date().toISOString();
      check(await db.from("github_repositories").insert({ ...row, last_seen_at: now, last_synced_at: now }));
    },

    async updateRepository(id, row, status) {
      const now = new Date().toISOString();
      check(
        await db
          .from("github_repositories")
          .update({ ...row, ...(status ? { status } : {}), last_seen_at: now, last_synced_at: now })
          .eq("github_repository_id", id),
      );
    },

    async touchRepository(id) {
      const now = new Date().toISOString();
      check(await db.from("github_repositories").update({ last_seen_at: now, last_synced_at: now }).eq("github_repository_id", id));
    },

    async markMissing(ids) {
      if (ids.length === 0) return;
      check(await db.from("github_repositories").update({ status: "missing" }).in("github_repository_id", ids));
    },
  };
}

export function createSupabaseWebhookStore(db: SupabaseClient): WebhookEventStore {
  return {
    async recordEvent(e) {
      // delivery_id is UNIQUE: a redelivery violates it, which is how we detect duplicates atomically.
      const { error } = await db.from("github_webhook_events").insert({
        delivery_id: e.deliveryId,
        event_type: e.eventType,
        action: e.action,
        repository_id: e.repositoryId,
        signature_valid: true, // events are only recorded after signature verification
        payload: e.payload,
      });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(error.message);
    },

    async resolveEvent(deliveryId, status, errorMessage) {
      check(
        await db
          .from("github_webhook_events")
          .update({ status, processed_at: new Date().toISOString(), error_message: errorMessage ?? null })
          .eq("delivery_id", deliveryId),
      );
    },
  };
}
