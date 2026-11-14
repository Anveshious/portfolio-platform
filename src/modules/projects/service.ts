import type { SupabaseClient } from "@supabase/supabase-js";
import { errors } from "@/lib/api/errors";
import { unwrap } from "@/lib/database/errors";
import { slugify } from "@/lib/validation/common";
import { PROJECT_SELECT, toPublicProject } from "./mapper";
import { publishBlockers } from "./visibility";
import type { CreateProjectInput, UpdateProjectInput } from "./schema";

/* ------------------------------ Public reads ------------------------------ */
/* These take the ANON client. RLS (projects_public_read) is the enforcement
   layer; the explicit filters below are belt-and-braces and document intent. */

function publicQuery(db: SupabaseClient) {
  return db
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("publication_state", "published")
    .eq("visibility", "public");
}

export async function listPublicProjects(db: SupabaseClient) {
  const rows = unwrap(await publicQuery(db).order("display_order").order("created_at", { ascending: false }));
  return (rows as unknown as Record<string, unknown>[]).map(toPublicProject);
}

export async function listFeaturedProjects(db: SupabaseClient) {
  const rows = unwrap(await publicQuery(db).eq("featured", true).order("display_order"));
  return (rows as unknown as Record<string, unknown>[]).map(toPublicProject);
}

export async function listActiveProjects(db: SupabaseClient) {
  const rows = unwrap(await publicQuery(db).eq("development_status", "in_progress").order("display_order"));
  return (rows as unknown as Record<string, unknown>[]).map(toPublicProject);
}

export async function getPublicProjectBySlug(db: SupabaseClient, slug: string) {
  const row = unwrap(await publicQuery(db).eq("slug", slug).maybeSingle());
  if (!row) throw errors.notFound("Project");
  return toPublicProject(row as unknown as Record<string, unknown>);
}

/* ------------------------------ Admin operations --------------------------- */
/* These take the SERVICE-ROLE client and MUST only be called behind adminRoute. */

const ADMIN_SELECT = `*, github_repositories(*), project_technologies(name, position), project_media(*)`;

export async function listAdminProjects(
  db: SupabaseClient,
  filter: { publication_state?: string; development_status?: string } = {},
) {
  let q = db.from("projects").select(ADMIN_SELECT).order("display_order").order("created_at", { ascending: false });
  if (filter.publication_state) q = q.eq("publication_state", filter.publication_state);
  if (filter.development_status) q = q.eq("development_status", filter.development_status);
  return unwrap(await q);
}

export async function getAdminProject(db: SupabaseClient, id: string) {
  const row = unwrap(await db.from("projects").select(ADMIN_SELECT).eq("id", id).maybeSingle());
  if (!row) throw errors.notFound("Project");
  return row;
}

async function uniqueSlug(db: SupabaseClient, desired: string): Promise<string> {
  const rows = unwrap(await db.from("projects").select("slug").like("slug", `${desired}%`)) as { slug: string }[];
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(desired)) return desired;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${desired}-${i}`)) return `${desired}-${i}`;
  throw errors.conflict("Could not derive a unique slug.");
}

async function replaceTechnologies(db: SupabaseClient, projectId: string, names: string[]) {
  // Not atomic (two statements). Acceptable for owner-only, low-frequency edits; see docs/DATABASE.md.
  unwrap(await db.from("project_technologies").delete().eq("project_id", projectId));
  const unique = [...new Set(names)];
  if (unique.length) {
    unwrap(
      await db.from("project_technologies").insert(unique.map((name, position) => ({ project_id: projectId, name, position }))),
    );
  }
}

export async function createProject(db: SupabaseClient, input: CreateProjectInput, extra: { github_repository_id?: string } = {}) {
  const { technologies, slug, ...fields } = input;
  const finalSlug = slug ?? (await uniqueSlug(db, slugify(input.title)));
  // New projects always start as hidden drafts regardless of input.
  const created = unwrap(
    await db
      .from("projects")
      .insert({ ...fields, slug: finalSlug, publication_state: "draft", visibility: "hidden", featured: false, ...extra })
      .select("id")
      .single(),
  ) as { id: string };
  await replaceTechnologies(db, created.id, technologies);
  return getAdminProject(db, created.id);
}

export async function updateProject(db: SupabaseClient, id: string, input: UpdateProjectInput) {
  const { technologies, ...fields } = input;
  if (Object.keys(fields).length > 0) {
    unwrap(await db.from("projects").update(fields).eq("id", id).select("id").single());
  } else {
    await getAdminProject(db, id); // existence check
  }
  if (technologies) await replaceTechnologies(db, id, technologies);
  return getAdminProject(db, id);
}

export async function deleteProject(db: SupabaseClient, id: string) {
  const project = (await getAdminProject(db, id)) as { github_repository_id: string | null };
  unwrap(await db.from("projects").delete().eq("id", id));
  // Return the repository to the discovery pool.
  if (project.github_repository_id) {
    unwrap(await db.from("github_repositories").update({ status: "discovered" }).eq("id", project.github_repository_id).eq("status", "imported"));
  }
}

export async function setPublication(db: SupabaseClient, id: string, action: "publish" | "unpublish") {
  const project = (await getAdminProject(db, id)) as { title: string; slug: string; short_description: string | null };
  if (action === "publish") {
    const blockers = publishBlockers(project);
    if (blockers.length) throw new (await import("@/lib/api/errors")).ApiError("validation_failed", "Project cannot be published yet.", blockers);
    unwrap(await db.from("projects").update({ publication_state: "published", visibility: "public" }).eq("id", id));
  } else {
    unwrap(await db.from("projects").update({ publication_state: "unpublished", visibility: "hidden" }).eq("id", id));
  }
  return getAdminProject(db, id);
}

export async function setFeatured(db: SupabaseClient, id: string, featured: boolean) {
  unwrap(await db.from("projects").update({ featured }).eq("id", id).select("id").single());
  return getAdminProject(db, id);
}

export async function reorderProjects(db: SupabaseClient, items: { id: string; display_order: number }[]) {
  for (const item of items) {
    unwrap(await db.from("projects").update({ display_order: item.display_order }).eq("id", item.id));
  }
}

/** Import a discovered repository as a DRAFT project. GitHub's description is NOT copied. */
export async function importRepository(
  db: SupabaseClient,
  repositoryId: string,
  overrides: { title?: string; slug?: string; category?: string | null },
) {
  const repo = unwrap(await db.from("github_repositories").select("id, name, status").eq("id", repositoryId).maybeSingle()) as
    | { id: string; name: string; status: string }
    | null;
  if (!repo) throw errors.notFound("Repository");
  if (repo.status === "missing") throw errors.conflict("Repository no longer exists on GitHub.");

  const already = unwrap(await db.from("projects").select("id").eq("github_repository_id", repo.id).maybeSingle());
  if (already) throw errors.conflict("This repository has already been imported.");

  const title = overrides.title ?? repo.name.replace(/[-_]+/g, " ");
  const project = await createProject(
    db,
    {
      title,
      slug: overrides.slug,
      category: overrides.category ?? null,
      development_status: "planning",
      display_order: 0,
      technologies: [],
    },
    { github_repository_id: repo.id },
  );
  unwrap(await db.from("github_repositories").update({ status: "imported" }).eq("id", repo.id));
  return project;
}

export async function attachMedia(
  db: SupabaseClient,
  projectId: string,
  input: { media_asset_id: string; role: string; caption?: string | null; display_order: number },
) {
  await getAdminProject(db, projectId);
  return unwrap(await db.from("project_media").insert({ project_id: projectId, ...input }).select("*").single());
}

export async function detachMedia(db: SupabaseClient, projectId: string, projectMediaId: string) {
  unwrap(await db.from("project_media").delete().eq("id", projectMediaId).eq("project_id", projectId));
}
