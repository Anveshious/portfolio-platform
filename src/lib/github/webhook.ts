import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { GithubClient } from "./types";
import { applyRepository, type GithubStore } from "./sync";

/**
 * Verify X-Hub-Signature-256 against the RAW request body.
 * The body must not be parsed and re-serialised before verification.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const provided = Buffer.from(signatureHeader);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export const webhookHeadersSchema = z.object({
  delivery: z.string().min(1),
  event: z.string().min(1),
});

const repositoryRef = z.object({
  id: z.number().int().positive(),
  private: z.boolean().optional(),
  owner: z.object({ id: z.number().int().positive() }),
});

/** Payloads we act on. Everything else is logged and ignored. */
export const webhookPayloadSchema = z.object({
  action: z.string().optional(),
  repository: repositoryRef.optional(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/** Events that can change data we mirror. */
const REFRESH_EVENTS = new Set(["repository", "push", "star", "watch", "fork", "public", "release"]);

export interface WebhookEventStore {
  /** Returns false if this delivery was already recorded (idempotency). */
  recordEvent(event: {
    deliveryId: string;
    eventType: string;
    action: string | null;
    repositoryId: number | null;
    payload: unknown;
  }): Promise<boolean>;
  resolveEvent(deliveryId: string, status: "processed" | "ignored" | "failed", error?: string): Promise<void>;
}

export type WebhookResult = "duplicate" | "processed" | "ignored" | "failed";

export async function processWebhookEvent(
  deps: { client: GithubClient; store: GithubStore; events: WebhookEventStore },
  input: { deliveryId: string; eventType: string; payload: WebhookPayload; rawPayload: unknown; ownerGithubId: number },
): Promise<WebhookResult> {
  const { payload } = input;
  const repo = payload.repository;

  const isNew = await deps.events.recordEvent({
    deliveryId: input.deliveryId,
    eventType: input.eventType,
    action: payload.action ?? null,
    repositoryId: repo?.id ?? null,
    payload: input.rawPayload,
  });
  if (!isNew) return "duplicate";

  try {
    if (!repo || !REFRESH_EVENTS.has(input.eventType) || repo.owner.id !== input.ownerGithubId) {
      await deps.events.resolveEvent(input.deliveryId, "ignored");
      return "ignored";
    }

    const removed = input.eventType === "repository" && (payload.action === "deleted" || payload.action === "privatized");
    if (removed || repo.private) {
      await deps.store.markMissing([repo.id]);
    } else {
      // Fetch authoritative state rather than trusting the (possibly stale) payload.
      const api = await deps.client.getRepositoryById(repo.id);
      if (!api || api.private) {
        await deps.store.markMissing([repo.id]);
      } else {
        const existing = (await deps.store.listExisting()).find((e) => e.githubRepositoryId === repo.id);
        await applyRepository(deps, api, existing);
      }
    }
    await deps.events.resolveEvent(input.deliveryId, "processed");
    return "processed";
  } catch (error) {
    await deps.events.resolveEvent(input.deliveryId, "failed", error instanceof Error ? error.message : String(error));
    return "failed";
  }
}
