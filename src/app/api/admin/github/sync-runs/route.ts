import { adminRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { unwrap } from "@/lib/database/errors";

export const GET = adminRoute(async () =>
  ok(unwrap(await createAdminClient().from("github_sync_runs").select("*").order("started_at", { ascending: false }).limit(50))),
);
