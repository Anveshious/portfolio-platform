import { describe, expect, it } from "vitest";
import { normalizeRepository, PrivateRepositoryError, toRepositoryRow } from "@/lib/github/normalize";
import { apiRepo } from "./helpers";

describe("repository normalisation", () => {
  it("maps fields and sorts topics", () => {
    const n = normalizeRepository(apiRepo({ description: "  spaced  " }));
    expect(n).toMatchObject({ githubRepositoryId: 1, fullName: "owner/demo", primaryLanguage: "TypeScript", description: "spaced", topics: ["a", "b"] });
  });

  it("refuses private repositories", () => {
    expect(() => normalizeRepository(apiRepo({ private: true }))).toThrow(PrivateRepositoryError);
  });

  it("hash is stable and changes when meaningful data changes", () => {
    const a = normalizeRepository(apiRepo());
    expect(normalizeRepository(apiRepo({ topics: ["a", "b"] })).contentHash).toBe(a.contentHash);
    expect(normalizeRepository(apiRepo({ stargazers_count: 4 })).contentHash).not.toBe(a.contentHash);
    expect(normalizeRepository(apiRepo({ archived: true })).contentHash).not.toBe(a.contentHash);
  });

  it("DB row contains only GitHub-sourced columns", () => {
    const row = toRepositoryRow(normalizeRepository(apiRepo()));
    for (const owned of ["title", "slug", "short_description", "detailed_description", "featured", "visibility", "publication_state"]) {
      expect(row).not.toHaveProperty(owned);
    }
    expect(row).toHaveProperty("github_repository_id", 1);
  });
});
