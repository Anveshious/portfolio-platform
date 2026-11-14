import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { errors } from "@/lib/api/errors";
import { unwrap } from "@/lib/database/errors";
import {
  achievementSchema, activitySchema, experienceSchema, opportunitySchema, skillSchema, socialLinkSchema,
} from "./schemas";

/**
 * Generic CRUD for the simple, ordered content tables. Each resource declares its table and
 * schemas once; the same definition drives public reads and admin mutations.
 * Update validation re-runs the full schema on the MERGED record so cross-field rules
 * (e.g. "public requires verified") cannot be bypassed by partial updates.
 */
export interface ContentResource {
  table: string;
  schema: z.ZodType<Record<string, unknown>>;
  orderBy: string;
}

export const CONTENT_RESOURCES = {
  skills: { table: "skills", schema: skillSchema, orderBy: "display_order" },
  achievements: { table: "achievements", schema: achievementSchema, orderBy: "display_order" },
  experiences: { table: "experiences", schema: experienceSchema, orderBy: "display_order" },
  opportunities: { table: "opportunities", schema: opportunitySchema, orderBy: "display_order" },
  socials: { table: "social_links", schema: socialLinkSchema, orderBy: "display_order" },
  activities: { table: "current_activities", schema: activitySchema, orderBy: "display_order" },
} as const satisfies Record<string, ContentResource>;

export type ContentResourceName = keyof typeof CONTENT_RESOURCES;

export function resolveResource(name: string): ContentResource {
  if (!Object.hasOwn(CONTENT_RESOURCES, name)) throw errors.notFound("Resource type");
  return CONTENT_RESOURCES[name as ContentResourceName];
}

/** Public read via anon client; RLS limits to visibility = 'public'. */
export async function listPublic(db: SupabaseClient, name: ContentResourceName) {
  const r = CONTENT_RESOURCES[name];
  return unwrap(await db.from(r.table).select("*").eq("visibility", "public").order(r.orderBy).order("created_at"));
}

export async function listAll(db: SupabaseClient, r: ContentResource) {
  return unwrap(await db.from(r.table).select("*").order(r.orderBy).order("created_at"));
}

export async function createItem(db: SupabaseClient, r: ContentResource, body: unknown) {
  const input = r.schema.parse(body);
  return unwrap(await db.from(r.table).insert(input).select("*").single());
}

export async function updateItem(db: SupabaseClient, r: ContentResource, id: string, patch: unknown) {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw errors.badRequest("Body must be an object.");
  const current = unwrap(await db.from(r.table).select("*").eq("id", id).maybeSingle()) as Record<string, unknown> | null;
  if (!current) throw errors.notFound();
  const { id: _id, created_at: _c, updated_at: _u, ...editable } = current; // eslint-disable-line @typescript-eslint/no-unused-vars
  const merged = r.schema.parse({ ...editable, ...(patch as Record<string, unknown>) });
  return unwrap(await db.from(r.table).update(merged).eq("id", id).select("*").single());
}

export async function deleteItem(db: SupabaseClient, r: ContentResource, id: string) {
  const row = unwrap(await db.from(r.table).delete().eq("id", id).select("id"));
  if (!(row as unknown[]).length) throw errors.notFound();
}
