import { ApiError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { getServerEnv } from "@/lib/config/env";
import { buildGithubDeps } from "@/lib/services/github";
import { processWebhookEvent, verifyWebhookSignature, webhookPayloadSchema } from "@/lib/github/webhook";

export const runtime = "nodejs";

/**
 * GitHub webhook receiver. Order matters:
 *  1. read RAW body  2. verify HMAC signature  3. validate payload  4. idempotent processing.
 * Unsigned or badly signed requests get 401 and are never stored or processed.
 */
export async function POST(request: Request) {
  try {
    const { GITHUB_WEBHOOK_SECRET } = getServerEnv();
    if (!GITHUB_WEBHOOK_SECRET) throw new ApiError("misconfigured", "Webhook secret not configured.");

    const rawBody = await request.text();
    if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), GITHUB_WEBHOOK_SECRET)) {
      console.warn("Rejected GitHub webhook: invalid signature");
      throw new ApiError("unauthenticated", "Invalid signature.");
    }

    const deliveryId = request.headers.get("x-github-delivery");
    const eventType = request.headers.get("x-github-event");
    if (!deliveryId || !eventType) throw new ApiError("bad_request", "Missing GitHub delivery headers.");

    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); } catch { throw new ApiError("bad_request", "Body is not valid JSON."); }
    const payload = webhookPayloadSchema.parse(parsed);

    const { env, client, store, events } = buildGithubDeps();
    const result = await processWebhookEvent(
      { client, store, events },
      { deliveryId, eventType, payload, rawPayload: parsed, ownerGithubId: Number(env.ADMIN_GITHUB_ID) },
    );
    // Always 200 for handled/duplicate deliveries so GitHub does not retry needlessly.
    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
