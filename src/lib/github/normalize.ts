import { createHash } from "node:crypto";
import type { GithubApiRepository, NormalizedRepository, RepositoryEnrichment, RepositoryRow } from "./types";

export class PrivateRepositoryError extends Error {
  constructor(id: number) {
    super(`Repository ${id} is private and must never be stored.`);
    this.name = "PrivateRepositoryError";
  }
}

/**
 * Convert a raw GitHub API repository into our normalised model.
 * Private repositories are rejected outright (defence in depth: we never
 * request private scopes, but we also never persist a private repo).
 */
export function normalizeRepository(repo: GithubApiRepository): NormalizedRepository {
  if (repo.private) throw new PrivateRepositoryError(repo.id);

  const base = {
    githubRepositoryId: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    description: repo.description?.trim() || null,
    primaryLanguage: repo.language ?? null,
    topics: [...(repo.topics ?? [])].sort(),
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    defaultBranch: repo.default_branch ?? null,
    isFork: repo.fork,
    isArchived: repo.archived,
    githubCreatedAt: repo.created_at,
    githubUpdatedAt: repo.updated_at,
    githubPushedAt: repo.pushed_at,
  };
  return { ...base, contentHash: hashFields(base) };
}

function hashFields(fields: Record<string, unknown>): string {
  const ordered = Object.keys(fields)
    .sort()
    .map((k) => [k, fields[k]]);
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

/** Map to DB columns of github_repositories. Never includes owner-managed content. */
export function toRepositoryRow(repo: NormalizedRepository, extra?: RepositoryEnrichment): RepositoryRow {
  return {
    github_repository_id: repo.githubRepositoryId,
    name: repo.name,
    full_name: repo.fullName,
    html_url: repo.htmlUrl,
    description: repo.description,
    primary_language: repo.primaryLanguage,
    topics: repo.topics,
    stars: repo.stars,
    forks: repo.forks,
    default_branch: repo.defaultBranch,
    is_fork: repo.isFork,
    is_archived: repo.isArchived,
    github_created_at: repo.githubCreatedAt,
    github_updated_at: repo.githubUpdatedAt,
    github_pushed_at: repo.githubPushedAt,
    content_hash: repo.contentHash,
    ...(extra
      ? { languages: extra.languages, readme_markdown: extra.readmeMarkdown, readme_sha: extra.readmeSha }
      : {}),
  };
}
