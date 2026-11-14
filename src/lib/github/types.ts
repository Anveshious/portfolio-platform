/** Subset of the GitHub REST "repository" object that we rely on. */
export interface GithubApiRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  fork: boolean;
  archived: boolean;
  private: boolean;
  created_at: string | null;
  updated_at: string | null;
  pushed_at: string | null;
  owner: { id: number; login: string };
}

/** GitHub-sourced data, normalised to our domain model (camelCase, no secrets). */
export interface NormalizedRepository {
  githubRepositoryId: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  primaryLanguage: string | null;
  topics: string[];
  stars: number;
  forks: number;
  defaultBranch: string | null;
  isFork: boolean;
  isArchived: boolean;
  githubCreatedAt: string | null;
  githubUpdatedAt: string | null;
  githubPushedAt: string | null;
  /** Stable hash of all fields above; used for change detection. */
  contentHash: string;
}

export interface RepositoryEnrichment {
  languages: Record<string, number>;
  readmeMarkdown: string | null;
  readmeSha: string | null;
}

export interface RepositoryRow extends Record<string, unknown> {
  github_repository_id: number;
}

/** Narrow client abstraction so services never touch Octokit directly (and tests can fake it). */
export interface GithubClient {
  /** Resolve the CURRENT login for a numeric account ID (usernames can change). */
  getLoginById(accountId: number): Promise<string>;
  listPublicRepositories(login: string): Promise<GithubApiRepository[]>;
  getRepositoryById(id: number): Promise<GithubApiRepository | null>;
  getReadme(owner: string, repo: string): Promise<{ markdown: string; sha: string } | null>;
  getLanguages(owner: string, repo: string): Promise<Record<string, number>>;
  getRateLimit(): Promise<{ limit: number; remaining: number; resetAt: string }>;
}
