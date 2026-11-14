/**
 * Single source of truth for "may the public see this?".
 * The same rule is enforced in the database (RLS policy `projects_public_read`);
 * this TypeScript mirror powers application-level checks and tests.
 */
export type ProjectVisibilityFields = {
  publication_state: "draft" | "published" | "unpublished";
  visibility: "public" | "hidden";
};

export function isPubliclyVisible(p: ProjectVisibilityFields): boolean {
  return p.publication_state === "published" && p.visibility === "public";
}

export type PublishabilityFields = { title?: string | null; slug?: string | null; short_description?: string | null };

/** Returns human-readable problems that block publishing (empty array = publishable). */
export function publishBlockers(p: PublishabilityFields): string[] {
  const problems: string[] = [];
  if (!p.title?.trim()) problems.push("A title is required.");
  if (!p.slug?.trim()) problems.push("A slug is required.");
  if (!p.short_description?.trim()) problems.push("A short description written by you is required (the GitHub description is not used automatically).");
  return problems;
}
