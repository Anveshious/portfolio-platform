import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { unwrap } from "@/lib/database/errors";
import { storagePublicUrl } from "@/lib/storage/policy";
import { shortText, uuid, visibility } from "@/lib/validation/common";

export const profileSchema = z.object({
  full_name: shortText,
  headline: z.string().trim().max(200).nullish(),
  biography: z.string().trim().max(20000).nullish(),
  photo_asset_id: uuid.nullish(),
  institution: z.string().trim().max(200).nullish(),
  degree: z.string().trim().max(200).nullish(),
  field_of_study: z.string().trim().max(200).nullish(),
  graduation_year: z.number().int().min(1950).max(2100).nullish(),
  location: z.string().trim().max(200).nullish(),
  contact_email: z.email().nullish(),
  visibility: visibility.default("hidden"),
});

const SELECT = "*, media_assets(bucket, storage_path, alt_text, width, height)";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function shape(row: Row) {
  const { media_assets: photo, id: _id, created_at: _c, ...rest } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
  const photoRow = Array.isArray(photo) ? photo[0] : photo;
  return {
    ...rest,
    photo_url: photoRow ? storagePublicUrl(photoRow.bucket, photoRow.storage_path) : null,
    photo_alt: photoRow?.alt_text ?? null,
  };
}

export async function getPublicProfile(db: SupabaseClient) {
  const row = unwrap(await db.from("profiles").select(SELECT).eq("visibility", "public").maybeSingle());
  return row ? shape(row as Row) : null;
}

export async function getAdminProfile(db: SupabaseClient) {
  const row = unwrap(await db.from("profiles").select(SELECT).maybeSingle());
  return row ? shape(row as Row) : null;
}

/** The profile is a singleton (enforced by a unique index): update it if present, else create it. */
export async function upsertProfile(db: SupabaseClient, input: z.infer<typeof profileSchema>) {
  const existing = unwrap(await db.from("profiles").select("id").maybeSingle()) as { id: string } | null;
  if (existing) unwrap(await db.from("profiles").update(input).eq("id", existing.id));
  else unwrap(await db.from("profiles").insert(input));
  return getAdminProfile(db);
}
