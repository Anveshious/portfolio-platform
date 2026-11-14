import { publicRoute } from "@/lib/api/handler";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { ok } from "@/lib/api/response";
import { createPublicClient } from "@/lib/database/clients";
import { unwrap } from "@/lib/database/errors";
import { listPublicProjects } from "@/modules/projects/service";

/**
 * Aggregates come from the SECURITY DEFINER function public_github_summary() (totals only).
 * "Recent activity" is derived from published projects only, so unpublished repos never appear.
 * Contribution-graph data requires the GitHub GraphQL API and is NOT implemented yet.
 */
export const GET = publicRoute(async () => {
  const db = createPublicClient();
  const summary = unwrap(await db.rpc("public_github_summary"));
  const projects = await listPublicProjects(db);
  const recent = projects
    .filter((p) => p.repository?.last_pushed_at)
    .sort((a, b) => (b.repository!.last_pushed_at! > a.repository!.last_pushed_at! ? 1 : -1))
    .slice(0, 5)
    .map((p) => ({ project: p.title, slug: p.slug, repository: p.repository!.name, last_pushed_at: p.repository!.last_pushed_at }));
  return ok({ summary, recent }, { headers: PUBLIC_CACHE });
});
