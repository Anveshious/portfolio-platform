import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError, errors } from "@/lib/api/errors";
import { unwrap } from "@/lib/database/errors";
import { ALLOWED_MIME, MEDIA_BUCKET, validateUpload, storagePublicUrl } from "@/lib/storage/policy";

export const mediaKind = z.enum(["profile_photo", "thumbnail", "screenshot", "architecture_diagram", "certificate", "achievement_image", "other"]);
export const uploadFieldsSchema = z.object({ kind: mediaKind.default("other"), alt_text: z.string().trim().max(300).optional() });

export async function uploadMedia(
  db: SupabaseClient,
  file: File,
  fields: z.infer<typeof uploadFieldsSchema>,
  uploadedBy: string,
) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = validateUpload({ mimeType: file.type, size: file.size, head: bytes.slice(0, 16) });
  if (problem === "too_large") throw new ApiError("payload_too_large", "File exceeds the 10 MB limit.");
  if (problem === "type_not_allowed") throw new ApiError("unsupported_media_type", "Allowed types: JPEG, PNG, WebP, AVIF, PDF.");
  if (problem) throw errors.badRequest(problem === "empty" ? "File is empty." : "File content does not match its declared type.");

  // Server-chosen path: the client filename never influences storage location.
  const ext = ALLOWED_MIME[file.type]!.ext;
  const path = `${fields.kind}/${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;

  const up = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) {
    console.error("Storage upload failed:", up.error);
    throw new ApiError("upstream_error", "Storage upload failed.");
  }

  const { data, error } = await db
    .from("media_assets")
    .insert({
      bucket: MEDIA_BUCKET, storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type,
      size_bytes: file.size, alt_text: fields.alt_text ?? null, kind: fields.kind, uploaded_by: uploadedBy,
    })
    .select("*")
    .single();
  if (error) {
    await db.storage.from(MEDIA_BUCKET).remove([path]); // don't orphan the object
    unwrap({ data, error });
  }
  return { ...data, url: storagePublicUrl(MEDIA_BUCKET, path) };
}

export async function listMedia(db: SupabaseClient, kind?: string) {
  let q = db.from("media_assets").select("*").order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const rows = unwrap(await q) as { bucket: string; storage_path: string }[];
  return rows.map((r) => ({ ...r, url: storagePublicUrl(r.bucket, r.storage_path) }));
}

export async function getMedia(db: SupabaseClient, id: string) {
  const row = unwrap(await db.from("media_assets").select("*").eq("id", id).maybeSingle()) as { bucket: string; storage_path: string } | null;
  if (!row) throw errors.notFound("Media asset");
  return { ...row, url: storagePublicUrl(row.bucket, row.storage_path) };
}

export async function deleteMedia(db: SupabaseClient, id: string) {
  const row = (await getMedia(db, id)) as { bucket: string; storage_path: string };
  unwrap(await db.from("media_assets").delete().eq("id", id)); // FK rules null/cascade references
  const { error } = await db.storage.from(row.bucket).remove([row.storage_path]);
  if (error) console.error("Orphaned storage object after DB delete:", row.storage_path, error);
}
