import { ApiError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { requireCronSecret } from "@/lib/auth/guards";
import { syncGithub } from "@/lib/services/github";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Periodic reconciliation (fallback for missed webhooks). Invoked by Vercel Cron. */
export async function GET(request: Request) {
  try {
    requireCronSecret(request);
    const summary = await syncGithub("scheduled");
    if (summary.status === "failed") throw new ApiError("upstream_error", "Scheduled sync failed.", summary.errors);
    return ok(summary);
  } catch (error) {
    return fail(error);
  }
}
