import { z } from "zod";
import { adminRoute } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { unwrap } from "@/lib/database/errors";

const query = z.object({ status: z.enum(["discovered", "imported", "ignored", "missing"]).optional() });

export const GET = adminRoute(async (req) => {
  const { status } = parseQuery(req, query);
  let q = createAdminClient()
    .from("github_repositories")
    .select("id, github_repository_id, name, full_name, html_url, description, primary_language, topics, stars, forks, default_branch, is_fork, is_archived, github_pushed_at, status, last_synced_at")
    .order("github_pushed_at", { ascending: false, nullsFirst: false });
  if (status) q = q.eq("status", status);
  return ok(unwrap(await q)); // README bodies are omitted from listings
});
