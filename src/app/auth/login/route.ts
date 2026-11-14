import { NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/config/env";
import { createSessionClient } from "@/lib/database/clients";

/** Starts GitHub OAuth. Requests ONLY identity scope (read:user); no repo scope, ever. */
export async function GET() {
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/callback`, scopes: "read:user" },
  });
  if (error || !data.url) return NextResponse.redirect(`${NEXT_PUBLIC_SITE_URL}/?error=login_failed`);
  return NextResponse.redirect(data.url);
}
