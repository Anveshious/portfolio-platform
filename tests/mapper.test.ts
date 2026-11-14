import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config/env", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }) }));
import { toPublicProject } from "@/modules/projects/mapper";

describe("public project DTO", () => {
  const row = {
    id: "p1", title: "T", slug: "t", short_description: "mine", featured: true, development_status: "completed", display_order: 1,
    github_repository_id: "internal-uuid", publication_state: "published", visibility: "public",
    github_repositories: { name: "r", html_url: "u", description: "from github", primary_language: "Go", languages: {}, topics: [], stars: 2, forks: 0, default_branch: "main", github_pushed_at: null, last_synced_at: null, readme_markdown: "SECRET-README" },
    project_technologies: [{ name: "B", position: 1 }, { name: "A", position: 0 }],
    project_media: [{ id: "m", role: "thumbnail", caption: null, display_order: 0, media_assets: { bucket: "portfolio-media", storage_path: "a/b.png", alt_text: "alt", width: 1, height: 1 } }],
  };

  it("keeps GitHub data separate from owner text and does not leak internals", () => {
    const dto = toPublicProject(row);
    const json = JSON.stringify(dto);
    expect(dto.short_description).toBe("mine");
    expect(dto.repository?.description).toBe("from github");
    expect(json).not.toContain("SECRET-README");
    expect(json).not.toContain("internal-uuid");
    expect(json).not.toContain("publication_state");
    expect(dto.technologies).toEqual(["A", "B"]);
    expect(dto.media[0]?.url).toBe("https://x.supabase.co/storage/v1/object/public/portfolio-media/a/b.png");
  });
});
