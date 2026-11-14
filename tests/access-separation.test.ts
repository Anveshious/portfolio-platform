import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/config/env";

const getUser = vi.fn();
vi.mock("@/lib/database/clients", () => ({
  createSessionClient: async () => ({ auth: { getUser } }),
  createAdminClient: () => { throw new Error("admin client must not be reached when unauthenticated"); },
  createPublicClient: () => { throw new Error("stop"); },
}));

const API = path.resolve(__dirname, "../src/app/api");
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
  });
}
const rel = (f: string) => path.relative(API, f);

describe("static public/admin separation", () => {
  const admin = routeFiles(path.join(API, "admin"));
  const pub = routeFiles(path.join(API, "public"));

  it("finds routes to check", () => {
    expect(admin.length).toBeGreaterThan(10);
    expect(pub.length).toBeGreaterThanOrEqual(10);
  });

  it.each(admin.map((f) => [rel(f), f]))("%s: every exported handler is wrapped in adminRoute", (_n, f) => {
    const src = readFileSync(f as string, "utf8");
    const handlers = [...src.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)];
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) expect(src).toMatch(new RegExp(`export const ${h[1]} = adminRoute`));
  });

  it.each(pub.map((f) => [rel(f), f]))("%s: read-only, anon client only", (_n, f) => {
    const src = readFileSync(f as string, "utf8");
    expect(src).not.toMatch(/export (const|async function|function) (POST|PUT|PATCH|DELETE)\b/);
    expect(src).not.toContain("createAdminClient");
    expect(src).not.toContain("requireAdmin");
    expect(src).not.toContain("adminRoute");
    expect(src).not.toMatch(/\/admin\//);
  });

  it("webhook and cron routes verify their credentials before doing work", () => {
    const wh = readFileSync(path.join(API, "webhooks/github/route.ts"), "utf8");
    expect(wh.indexOf("verifyWebhookSignature(")).toBeGreaterThan(-1);
    expect(wh.indexOf("verifyWebhookSignature(")).toBeLessThan(wh.indexOf("buildGithubDeps()"));
    const cron = readFileSync(path.join(API, "cron/github-sync/route.ts"), "utf8");
    expect(cron.indexOf("requireCronSecret(")).toBeLessThan(cron.indexOf("syncGithub("));
  });

  it("service-role key is never referenced outside server-only modules", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const offenders = walk(path.resolve(__dirname, "../src")).filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(path.resolve(__dirname, "../src"), f)).sort()).toEqual(["lib/config/env.ts", "lib/database/clients.ts"]);
  });
});

describe("runtime: admin routes reject without a session", () => {
  beforeEach(() => {
    resetEnvCache();
    getUser.mockReset();
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a",
      SUPABASE_SERVICE_ROLE_KEY: "s", ADMIN_GITHUB_ID: "12345",
    });
  });

  it("GET /api/admin/projects -> 401 envelope", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("@/app/api/admin/projects/route");
    const res = await GET(new Request("http://x/api/admin/projects"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });

  it("POST /api/admin/github/sync -> 403 for a different GitHub account", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u", identities: [{ provider: "github", identity_data: { provider_id: "1" } }] } }, error: null });
    const { POST } = await import("@/app/api/admin/github/sync/route");
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("webhook without a signature -> 401 and nothing is processed", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "0123456789abcdef0123";
    const { POST } = await import("@/app/api/webhooks/github/route");
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("cron without bearer -> 401", async () => {
    process.env.CRON_SECRET = "0123456789abcdef0123";
    const { GET } = await import("@/app/api/cron/github-sync/route");
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });
});
