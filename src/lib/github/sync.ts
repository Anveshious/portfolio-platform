import type { GithubApiRepository, GithubClient, NormalizedRepository, RepositoryRow } from "./types";
import { normalizeRepository, PrivateRepositoryError, toRepositoryRow } from "./normalize";

export type SyncTrigger = "initial" | "manual" | "scheduled" | "webhook";
export type RepositoryStatus = "discovered" | "imported" | "ignored" | "missing";

export interface ExistingRepository {
  githubRepositoryId: number;
  contentHash: string;
  status: RepositoryStatus;
  /** True when an owner project references this repository. */
  hasLinkedProject: boolean;
}

export interface SyncSummary {
  runId: string;
  status: "succeeded" | "partial" | "failed";
  seen: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: string[];
}

/** Persistence port. The Supabase adapter lives in store.ts; tests use an in-memory fake. */
export interface GithubStore {
  startRun(trigger: SyncTrigger): Promise<string>;
  finishRun(runId: string, summary: Omit<SyncSummary, "runId">): Promise<void>;
  listExisting(): Promise<ExistingRepository[]>;
  insertRepository(row: RepositoryRow): Promise<void>;
  updateRepository(githubRepositoryId: number, row: Partial<RepositoryRow>, status?: RepositoryStatus): Promise<void>;
  touchRepository(githubRepositoryId: number): Promise<void>;
  markMissing(githubRepositoryIds: number[]): Promise<void>;
}

export type RepositoryOutcome = "created" | "updated" | "unchanged";

/**
 * Create/update ONE repository record. README and language data are only fetched when the
 * repository is new or its content hash changed, which keeps API usage low.
 * Writes only GitHub-sourced columns: owner-written project text is never touched.
 */
export async function applyRepository(
  deps: { client: GithubClient; store: GithubStore },
  api: GithubApiRepository,
  existing: ExistingRepository | undefined,
): Promise<RepositoryOutcome> {
  const normalized: NormalizedRepository = normalizeRepository(api);

  if (existing && existing.contentHash === normalized.contentHash && existing.status !== "missing") {
    await deps.store.touchRepository(normalized.githubRepositoryId);
    return "unchanged";
  }

  const [owner, repo] = normalized.fullName.split("/") as [string, string];
  const [readme, languages] = await Promise.all([
    deps.client.getReadme(owner, repo),
    deps.client.getLanguages(owner, repo),
  ]);
  const row = toRepositoryRow(normalized, {
    languages,
    readmeMarkdown: readme?.markdown ?? null,
    readmeSha: readme?.sha ?? null,
  });

  if (!existing) {
    await deps.store.insertRepository({ ...row, status: "discovered" });
    return "created";
  }
  // A repository that reappears after being missing returns to its logical state.
  const restored = existing.status === "missing" ? (existing.hasLinkedProject ? "imported" : "discovered") : undefined;
  await deps.store.updateRepository(normalized.githubRepositoryId, row, restored);
  return "updated";
}

/** Full reconciliation: discover, upsert, detect changes, flag repositories that vanished. */
export async function runSync(
  deps: { client: GithubClient; store: GithubStore },
  options: { ownerGithubId: number; trigger: SyncTrigger },
): Promise<SyncSummary> {
  const runId = await deps.store.startRun(options.trigger);
  const summary: Omit<SyncSummary, "runId"> = {
    status: "succeeded",
    seen: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    errors: [],
  };

  try {
    const login = await deps.client.getLoginById(options.ownerGithubId);
    const remote = (await deps.client.listPublicRepositories(login)).filter((r) => !r.private);
    const existing = await deps.store.listExisting();
    const existingById = new Map(existing.map((e) => [e.githubRepositoryId, e]));
    summary.seen = remote.length;

    for (const api of remote) {
      try {
        const outcome = await applyRepository(deps, api, existingById.get(api.id));
        summary[outcome] += 1;
      } catch (error) {
        if (error instanceof PrivateRepositoryError) continue;
        summary.errors.push(`${api.full_name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Safety valve: an empty listing alongside known repos is suspicious; do not mass-flag them.
    if (remote.length === 0 && existing.length > 0) {
      summary.errors.push("Listing returned no repositories; skipped missing-repository detection.");
    } else {
      const seenIds = new Set(remote.map((r) => r.id));
      const gone = existing.filter((e) => e.status !== "missing" && !seenIds.has(e.githubRepositoryId));
      if (gone.length > 0) {
        await deps.store.markMissing(gone.map((g) => g.githubRepositoryId));
        summary.missing = gone.length;
      }
    }
    summary.status = summary.errors.length > 0 ? "partial" : "succeeded";
  } catch (error) {
    summary.status = "failed";
    summary.errors.push(error instanceof Error ? error.message : String(error));
  }

  await deps.store.finishRun(runId, summary);
  return { runId, ...summary };
}
