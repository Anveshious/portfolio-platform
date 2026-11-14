import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";

// Placeholder for the future Admin Studio. Demonstrates server-side authorisation in a page.
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof ApiError && e.code === "unauthenticated") redirect("/auth/login");
    redirect("/?error=not_authorised");
  }
  return (
    <main className="flex min-h-screen items-center justify-center font-mono text-sm text-neutral-400">
      Admin Studio: authenticated as owner. UI pending.
    </main>
  );
}
