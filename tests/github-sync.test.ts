import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeRepository } from "@/lib/github/normalize";
import { runSync } from "@/lib/github/sync";
import { processWebhookEvent, verifyWebhookSignature, type WebhookEventStore } from "@/lib/github/webhook";
import { apiRepo, fakeClient, memoryStore } from "./helpers";

const opts = { ownerGithubId: 42, trigger: "manual" as const };

describe("runSync", () => {
  it("creates new repositories as 'discovered' (never auto-published)", async () => {
    const { store, rows } = memoryStore();
    const s = await runSync({ client: fakeClient([apiRepo({ id: 1 }), apiRepo({ id: 2, name: "b", full_name: "owner/b" })]), store }, opts);
    expect(s).toMatchObject({ status: "succeeded", seen: 2, created: 2, updated: 0, missing: 0 });
    expect([...rows.values()].every((r) => r.status === "discovered")).toBe(true);
  });

  it("skips README fetch for unchanged repositories (change detection)", async () => {
    const repo = apiRepo();
    const { store } = memoryStore([{ githubRepositoryId: 1, contentHash: normalizeRepository(repo).contentHash, status: "imported", hasLinkedProject: true }]);
    const client = fakeClient([repo]);
    const s = await runSync({ client, store }, opts);
    expect(s).toMatchObject({ unchanged: 1, created: 0, updated: 0 });
    expect(client.readmeCalls).toBe(0);
  });

  it("updates changed repositories and keeps their status", async () => {
    const { store, rows } = memoryStore([{ githubRepositoryId: 1, contentHash: "old", status: "imported", hasLinkedProject: true }]);
    const s = await runSync({ client: fakeClient([apiRepo({ stargazers_count: 99 })]), store }, opts);
    expect(s.updated).toBe(1);
    expect(rows.get(1)?.status).toBe("imported");
    expect(rows.get(1)?.row.stars).toBe(99);
  });

  it("never writes owner-managed columns", async () => {
    const { store, rows } = memoryStore();
    await runSync({ client: fakeClient([apiRepo()]), store }, opts);
    expect(Object.keys(rows.get(1)!.row)).not.toContain("short_description");
  });

  it("flags vanished repositories as missing and restores them when they return", async () => {
    const { store, rows } = memoryStore([
      { githubRepositoryId: 1, contentHash: "x", status: "imported", hasLinkedProject: true },
      { githubRepositoryId: 2, contentHash: "y", status: "discovered", hasLinkedProject: false },
    ]);
    const s = await runSync({ client: fakeClient([apiRepo({ id: 1 })]), store }, opts);
    expect(s.missing).toBe(1);
    expect(rows.get(2)?.status).toBe("missing");
    await runSync({ client: fakeClient([apiRepo({ id: 1 }), apiRepo({ id: 2, name: "b", full_name: "owner/b" })]), store }, opts);
    expect(rows.get(2)?.status).toBe("discovered");
  });

  it("does not mass-flag repositories when the listing is unexpectedly empty", async () => {
    const { store, rows } = memoryStore([{ githubRepositoryId: 1, contentHash: "x", status: "imported", hasLinkedProject: true }]);
    const s = await runSync({ client: fakeClient([]), store }, opts);
    expect(s.status).toBe("partial");
    expect(rows.get(1)?.status).toBe("imported");
  });

  it("ignores private repositories even if the API returns them", async () => {
    const { store, rows } = memoryStore();
    await runSync({ client: fakeClient([apiRepo({ id: 5, private: true })]), store }, opts);
    expect(rows.size).toBe(0);
  });

  it("reports failure when GitHub is unreachable", async () => {
    const client = { ...fakeClient([]), listPublicRepositories: async () => { throw new Error("rate limited"); } };
    const s = await runSync({ client, store: memoryStore().store }, opts);
    expect(s.status).toBe("failed");
    expect(s.errors[0]).toContain("rate limited");
  });
});

describe("webhooks", () => {
  const secret = "0123456789abcdef0123";
  const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("verifies signatures over the raw body", () => {
    const body = '{"a":1}';
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true);
    expect(verifyWebhookSignature(body + " ", sign(body), secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body).replace("sha256=", "sha1="), secret)).toBe(false);
  });

  function events() {
    const seen = new Set<string>();
    const resolved: Record<string, string> = {};
    const store: WebhookEventStore = {
      recordEvent: async (e) => (seen.has(e.deliveryId) ? false : (seen.add(e.deliveryId), true)),
      resolveEvent: async (id, status) => { resolved[id] = status; },
    };
    return { store, resolved };
  }
  const payload = (over = {}) => ({ action: "edited", repository: { id: 1, owner: { id: 42 } }, ...over });

  it("is idempotent per delivery id", async () => {
    const { store } = memoryStore();
    const ev = events();
    const deps = { client: fakeClient([apiRepo()]), store, events: ev.store };
    const input = { deliveryId: "d1", eventType: "push", payload: payload(), rawPayload: {}, ownerGithubId: 42 };
    expect(await processWebhookEvent(deps, input)).toBe("processed");
    expect(await processWebhookEvent(deps, input)).toBe("duplicate");
  });

  it("ignores events for repositories owned by someone else, and unrelated event types", async () => {
    const { store, rows } = memoryStore();
    const ev = events();
    const deps = { client: fakeClient([apiRepo()]), store, events: ev.store };
    expect(await processWebhookEvent(deps, { deliveryId: "d2", eventType: "push", payload: payload({ repository: { id: 1, owner: { id: 999 } } }), rawPayload: {}, ownerGithubId: 42 })).toBe("ignored");
    expect(await processWebhookEvent(deps, { deliveryId: "d3", eventType: "issues", payload: payload(), rawPayload: {}, ownerGithubId: 42 })).toBe("ignored");
    expect(rows.size).toBe(0);
  });

  it("repository.deleted / privatized marks the record missing", async () => {
    const { store, rows } = memoryStore([{ githubRepositoryId: 1, contentHash: "x", status: "imported", hasLinkedProject: true }]);
    const ev = events();
    const deps = { client: fakeClient([]), store, events: ev.store };
    expect(await processWebhookEvent(deps, { deliveryId: "d4", eventType: "repository", payload: payload({ action: "privatized" }), rawPayload: {}, ownerGithubId: 42 })).toBe("processed");
    expect(rows.get(1)?.status).toBe("missing");
  });

  it("records failures instead of throwing", async () => {
    const { store } = memoryStore();
    const ev = events();
    const client = { ...fakeClient([]), getRepositoryById: async () => { throw new Error("boom"); } };
    expect(await processWebhookEvent({ client, store, events: ev.store }, { deliveryId: "d5", eventType: "push", payload: payload(), rawPayload: {}, ownerGithubId: 42 })).toBe("failed");
    expect(ev.resolved.d5).toBe("failed");
  });
});
