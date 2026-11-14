import { NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/config/env";
import { createSessionClient } from "@/lib/database/clients";

// POST only: GET sign-out can be triggered cross-site via <img> tags.
export async function POST() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(getPublicEnv().NEXT_PUBLIC_SITE_URL, { status: 303 });
}
