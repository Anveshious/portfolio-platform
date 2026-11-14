import type { GithubApiRepository, GithubClient } from "@/lib/github/types";
import type { ExistingRepository, GithubStore, RepositoryStatus } from "@/lib/github/sync";
import type { RepositoryRow } from "@/lib/github/types";

export function apiRepo(over: Partial<GithubApiRepository> = {}): GithubApiRepository {
  return {
    id: 1, name: "demo", full_name: "owner/demo", html_url: "https://github.com/owner/demo",
    description: "A demo", language: "TypeScript", topics: ["b", "a"], stargazers_count: 3, forks_count: 1,
    default_branch: "main", fork: false, archived: false, private: false,
    created_at: "2024-01-01T00:00:00Z", updated_at: "2024-02-01T00:00:00Z", pushed_at: "2024-02-01T00:00:00Z",
    owner: { id: 42, login: "owner" }, ...over,
  };
}

export function fakeClient(repos: GithubApiRepository[]): GithubClient & { readmeCalls: number } {
  const c = {
    readmeCalls: 0,
    getLoginById: async () => "owner",
    listPublicRepositories: async () => repos,
    getRepositoryById: async (id: number) => repos.find((r) => r.id === id) ?? null,
    getReadme: async () => { c.readmeCalls++; return { markdown: "# hi", sha: "sha1" }; },
    getLanguages: async () => ({ TypeScript: 100 }),
    getRateLimit: async () => ({ limit: 60, remaining: 59, resetAt: new Date().toISOString() }),
  };
  return c;
}

export function memoryStore(initial: ExistingRepository[] = []) {
  const rows = new Map<number, { hash: string; status: RepositoryStatus; row: RepositoryRow; linked: boolean }>();
  initial.forEach((e) => rows.set(e.githubRepositoryId, { hash: e.contentHash, status: e.status, row: { github_repository_id: e.githubRepositoryId }, linked: e.hasLinkedProject }));
  const runs: unknown[] = [];
  const store: GithubStore = {
    startRun: async () => "run-1",
    finishRun: async (_id, s) => { runs.push(s); },
    listExisting: async () => [...rows.entries()].map(([id, r]) => ({ githubRepositoryId: id, contentHash: r.hash, status: r.status, hasLinkedProject: r.linked })),
    insertRepository: async (row) => { rows.set(row.github_repository_id, { hash: String(row.content_hash), status: "discovered", row, linked: false }); },
    updateRepository: async (id, row, status) => { const r = rows.get(id)!; rows.set(id, { ...r, hash: String(row.content_hash ?? r.hash), row: { ...r.row, ...row }, status: status ?? r.status }); },
    touchRepository: async () => {},
    markMissing: async (ids) => { ids.forEach((id) => { const r = rows.get(id); if (r) r.status = "missing"; }); },
  };
  return { store, rows, runs };
}
