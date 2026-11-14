import { NextResponse } from "next/server";
import { getPublicEnv, getServerEnv } from "@/lib/config/env";
import { createAdminClient, createSessionClient } from "@/lib/database/clients";
import { getGithubAccountId, isConfiguredAdmin } from "@/lib/auth/identity";

/**
 * OAuth callback. Anyone can complete a GitHub login at the provider level, so authorisation
 * happens HERE and on every admin request: non-owners are signed out immediately.
 * (Also disable "Allow new users to sign up" in Supabase Auth settings; see docs.)
 */
export async function GET(request: Request) {
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
  const code = new URL(request.url).searchParams.get("code");
  const supabase = await createSessionClient();

  if (!code) return NextResponse.redirect(`${NEXT_PUBLIC_SITE_URL}/?error=missing_code`);
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) return NextResponse.redirect(`${NEXT_PUBLIC_SITE_URL}/?error=login_failed`);

  const { data } = await supabase.auth.getUser();
  const { ADMIN_GITHUB_ID } = getServerEnv();
  if (!data.user || !isConfiguredAdmin(data.user, ADMIN_GITHUB_ID)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${NEXT_PUBLIC_SITE_URL}/?error=not_authorised`);
  }

  // Best-effort: record the connection. Requires the admin_users seed row (docs/DATABASE.md).
  const db = createAdminClient();
  const { data: adminRow } = await db.from("admin_users").select("id").eq("github_user_id", Number(ADMIN_GITHUB_ID)).maybeSingle();
  if (adminRow) {
    await db.from("github_connections").upsert(
      {
        admin_user_id: adminRow.id,
        github_user_id: Number(getGithubAccountId(data.user)),
        github_login: String(data.user.user_metadata?.user_name ?? "unknown"),
        last_validated_at: new Date().toISOString(),
        status: "active",
      },
      { onConflict: "github_user_id" },
    );
  } else {
    console.warn("No admin_users row for configured ADMIN_GITHUB_ID; RLS-based admin access is not active yet.");
  }
  return NextResponse.redirect(`${NEXT_PUBLIC_SITE_URL}/admin`);
}
