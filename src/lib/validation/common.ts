import { z } from "zod";

export const uuid = z.uuid();
export const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

/** http(s) only: blocks javascript:, data:, etc. */
export const httpUrl = z.url({ protocol: /^https?$/ }).max(2048);
export const httpOrMailtoUrl = z.union([httpUrl, z.string().regex(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/)]);

export const isoDate = z.iso.date();
export const displayOrder = z.number().int().min(0).max(100000);
export const shortText = z.string().trim().min(1).max(200);
export const mediumText = z.string().trim().max(2000);
export const longText = z.string().trim().max(50000);

export const visibility = z.enum(["public", "hidden"]);
export const developmentStatus = z.enum(["planning", "in_progress", "completed", "archived"]);
export const publicationState = z.enum(["draft", "published", "unpublished"]);

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "project";
}
