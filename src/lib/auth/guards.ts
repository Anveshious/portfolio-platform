import { timingSafeEqual } from "node:crypto";
import { errors } from "@/lib/api/errors";
import { getServerEnv } from "@/lib/config/env";
import { createSessionClient } from "@/lib/database/clients";
import { isConfiguredAdmin } from "./identity";

export type AdminContext = { userId: string; githubAccountId: string };

/**
 * Verifies the caller is the single configured administrator.
 * Uses auth.getUser(), which re-validates the JWT with Supabase Auth
 * (unlike getSession(), which trusts the cookie).
 *
 * Throws ApiError(401) when unauthenticated and ApiError(403) when authenticated
 * as anyone other than the owner.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw errors.unauthenticated();

  const { ADMIN_GITHUB_ID } = getServerEnv();
  if (!isConfiguredAdmin(data.user, ADMIN_GITHUB_ID)) throw errors.forbidden();

  return { userId: data.user.id, githubAccountId: ADMIN_GITHUB_ID };
}

/** Constant-time bearer check. Exported separately so it can be unit tested. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Guard for scheduled jobs (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export function requireCronSecret(request: Request): void {
  const { CRON_SECRET } = getServerEnv();
  if (!CRON_SECRET) throw errors.forbidden();
  if (!bearerMatches(request.headers.get("authorization"), CRON_SECRET)) throw errors.unauthenticated();
}
