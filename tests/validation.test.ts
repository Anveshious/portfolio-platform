import { describe, expect, it } from "vitest";
import { httpUrl, slug, slugify } from "@/lib/validation/common";
import { createProjectSchema, updateProjectSchema } from "@/modules/projects/schema";
import { achievementSchema, experienceSchema, socialLinkSchema } from "@/modules/content/schemas";
import { EnvError, getServerEnv } from "@/lib/config/env";
import { validateUpload } from "@/lib/storage/policy";

describe("validation", () => {
  it("slugify produces valid slugs", () => {
    expect(slugify("  AegisDNS: Gateway-assisted DNSSEC!  ")).toBe("aegisdns-gateway-assisted-dnssec");
    expect(slug.safeParse(slugify("Ünïcode Título")).success).toBe(true);
    expect(slugify("!!!")).toBe("project");
  });

  it("rejects non-http(s) URLs", () => {
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrl.safeParse("data:text/html,x").success).toBe(false);
    expect(httpUrl.safeParse("https://example.com/demo").success).toBe(true);
    expect(socialLinkSchema.safeParse({ platform: "Email", url: "mailto:a@b.co" }).success).toBe(true);
    expect(socialLinkSchema.safeParse({ platform: "X", url: "javascript:1" }).success).toBe(false);
  });

  it("project create applies safe defaults and rejects bad input", () => {
    const ok = createProjectSchema.parse({ title: "CarboNex" });
    expect(ok.development_status).toBe("planning");
    expect(ok.technologies).toEqual([]);
    expect(createProjectSchema.safeParse({ title: "" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ title: "x", slug: "Bad Slug" }).success).toBe(false);
  });

  it("project update cannot change publication state, visibility or featured", () => {
    for (const field of ["publication_state", "visibility", "featured"]) {
      expect(updateProjectSchema.safeParse({ [field]: "published" }).success).toBe(false);
    }
    expect(updateProjectSchema.safeParse({ title: "New" }).success).toBe(true);
  });

  it("achievements can only be public when verified", () => {
    const base = { title: "Hackathon" };
    expect(achievementSchema.safeParse({ ...base, visibility: "public" }).success).toBe(false);
    expect(achievementSchema.safeParse({ ...base, visibility: "public", verification_status: "verified" }).success).toBe(true);
    expect(achievementSchema.parse(base).visibility).toBe("hidden");
  });

  it("experience end date must not precede start date", () => {
    const e = { organisation: "Club", position: "Lead", start_date: "2025-05-01", end_date: "2025-01-01" };
    expect(experienceSchema.safeParse(e).success).toBe(false);
  });

  it("env: requires numeric admin GitHub ID and treats empty strings as unset", () => {
    const base = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" };
    expect(() => getServerEnv({ ...base, ADMIN_GITHUB_ID: "octocat" })).toThrow(EnvError);
    expect(() => getServerEnv({ ...base, ADMIN_GITHUB_ID: "" })).toThrow(EnvError);
    expect(getServerEnv({ ...base, ADMIN_GITHUB_ID: "123", GITHUB_API_TOKEN: "" }).GITHUB_API_TOKEN).toBeUndefined();
  });

  it("upload validation checks size, type and magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateUpload({ mimeType: "image/png", size: 100, head: png })).toBeNull();
    expect(validateUpload({ mimeType: "image/png", size: 0, head: png })).toBe("empty");
    expect(validateUpload({ mimeType: "image/png", size: 11 * 1024 * 1024, head: png })).toBe("too_large");
    expect(validateUpload({ mimeType: "image/svg+xml", size: 10, head: png })).toBe("type_not_allowed");
    expect(validateUpload({ mimeType: "text/html", size: 10, head: png })).toBe("type_not_allowed");
    expect(validateUpload({ mimeType: "image/jpeg", size: 10, head: png })).toBe("content_mismatch");
  });
});
