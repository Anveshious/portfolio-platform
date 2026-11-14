import { storagePublicUrl } from "@/lib/storage/policy";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const PROJECT_SELECT = `
  id, title, slug, short_description, detailed_description, problem_statement, proposed_solution,
  architecture_description, role_and_contribution, category, live_demo_url, featured,
  development_status, display_order, published_at, updated_at,
  github_repositories ( name, html_url, description, primary_language, languages, topics, stars, forks,
                        default_branch, github_pushed_at, last_synced_at ),
  project_technologies ( name, position ),
  project_media ( id, role, caption, display_order, media_assets ( bucket, storage_path, alt_text, width, height ) )
`;

/**
 * Shape a DB row into the public DTO. Deliberately explicit (allow-list) so new columns
 * never leak publicly by accident. GitHub data is nested under `repository` and kept
 * separate from owner-written fields.
 */
export function toPublicProject(row: Row) {
  const repo: Row | null = Array.isArray(row.github_repositories) ? (row.github_repositories[0] ?? null) : row.github_repositories ?? null;
  const media = ((row.project_media ?? []) as Row[])
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => ({
      id: m.id as string,
      role: m.role as string,
      caption: (m.caption ?? null) as string | null,
      url: m.media_assets ? storagePublicUrl(m.media_assets.bucket, m.media_assets.storage_path) : null,
      alt_text: (m.media_assets?.alt_text ?? null) as string | null,
      width: (m.media_assets?.width ?? null) as number | null,
      height: (m.media_assets?.height ?? null) as number | null,
    }));

  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    short_description: row.short_description ?? null,
    detailed_description: row.detailed_description ?? null,
    problem_statement: row.problem_statement ?? null,
    proposed_solution: row.proposed_solution ?? null,
    architecture_description: row.architecture_description ?? null,
    role_and_contribution: row.role_and_contribution ?? null,
    category: row.category ?? null,
    live_demo_url: row.live_demo_url ?? null,
    featured: row.featured as boolean,
    development_status: row.development_status as string,
    display_order: row.display_order as number,
    published_at: row.published_at ?? null,
    technologies: ((row.project_technologies ?? []) as Row[])
      .sort((a, b) => a.position - b.position)
      .map((t) => t.name as string),
    media,
    repository: repo
      ? {
          name: repo.name, url: repo.html_url, description: repo.description, primary_language: repo.primary_language,
          languages: repo.languages, topics: repo.topics, stars: repo.stars, forks: repo.forks,
          default_branch: repo.default_branch, last_pushed_at: repo.github_pushed_at, last_synced_at: repo.last_synced_at,
        }
      : null,
  };
}

export type PublicProject = ReturnType<typeof toPublicProject>;
