import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/database/clients", () => ({ createSessionClient: async () => ({ auth: { getUser } }) }));

import { resetEnvCache } from "@/lib/config/env";
import { bearerMatches, requireAdmin } from "@/lib/auth/guards";
import { getGithubAccountId, isConfiguredAdmin } from "@/lib/auth/identity";

const githubUser = (id: string | number, extra: object = {}) => ({
  id: "uuid-1",
  user_metadata: { user_name: "someone", ...extra },
  identities: [{ provider: "github", id: String(id), identity_data: { provider_id: String(id) } }],
});

beforeEach(() => {
  resetEnvCache();
  getUser.mockReset();
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a",
    SUPABASE_SERVICE_ROLE_KEY: "s", ADMIN_GITHUB_ID: "12345",
  });
});

describe("identity", () => {
  it("authorises by numeric GitHub ID only", () => {
    expect(isConfiguredAdmin(githubUser(12345), "12345")).toBe(true);
    expect(isConfiguredAdmin(githubUser(99999), "12345")).toBe(false);
  });
  it("a matching USERNAME does not grant access", () => {
    expect(isConfiguredAdmin(githubUser(99999, { user_name: "owner-login", preferred_username: "12345" }), "12345")).toBe(false);
  });
  it("non-GitHub identities are rejected even with a matching id", () => {
    const u = { id: "u", identities: [{ provider: "google", id: "12345", identity_data: { sub: "12345" } }] };
    expect(getGithubAccountId(u)).toBeNull();
    expect(isConfiguredAdmin(u, "12345")).toBe(false);
  });
  it("handles missing identities", () => {
    expect(isConfiguredAdmin({ id: "u" }, "12345")).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });
  it("401 when token validation errors", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt expired" } });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it("403 for an authenticated non-owner", async () => {
    getUser.mockResolvedValue({ data: { user: githubUser(777) }, error: null });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
  it("returns context for the owner", async () => {
    getUser.mockResolvedValue({ data: { user: githubUser(12345) }, error: null });
    await expect(requireAdmin()).resolves.toEqual({ userId: "uuid-1", githubAccountId: "12345" });
  });
});

describe("bearerMatches", () => {
  it("accepts exact bearer, rejects everything else", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
    expect(bearerMatches("Bearer ", undefined)).toBe(false);
  });
});
