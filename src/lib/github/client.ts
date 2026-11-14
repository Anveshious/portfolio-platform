import { Octokit } from "octokit";
import type { GithubApiRepository, GithubClient } from "./types";

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { status?: number }).status === 404;
}

/**
 * Octokit-backed implementation. The token is OPTIONAL and, if supplied, should be a
 * fine-grained PAT with no extra permissions (public data only) purely to raise rate limits.
 * No OAuth user token is ever used for repository discovery.
 */
export function createOctokitClient(token?: string): GithubClient {
  const octokit = new Octokit({ ...(token ? { auth: token } : {}), userAgent: "developer-portfolio-platform" });

  return {
    async getLoginById(accountId) {
      const { data } = await octokit.rest.users.getById({ account_id: accountId });
      return data.login;
    },

    async listPublicRepositories(login) {
      const repos = await octokit.paginate(octokit.rest.repos.listForUser, {
        username: login,
        type: "owner",
        per_page: 100,
      });
      return repos as unknown as GithubApiRepository[];
    },

    async getRepositoryById(id) {
      try {
        const { data } = await octokit.request("GET /repositories/{id}", { id });
        return data as unknown as GithubApiRepository;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async getReadme(owner, repo) {
      try {
        const { data } = await octokit.rest.repos.getReadme({ owner, repo });
        return { markdown: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async getLanguages(owner, repo) {
      const { data } = await octokit.rest.repos.listLanguages({ owner, repo });
      return data;
    },

    async getRateLimit() {
      const { data } = await octokit.rest.rateLimit.get();
      const core = data.resources.core;
      return { limit: core.limit, remaining: core.remaining, resetAt: new Date(core.reset * 1000).toISOString() };
    },
  };
}
