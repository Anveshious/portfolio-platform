import { z } from "zod";
import { adminRoute } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/request";
import { ApiError, errors } from "@/lib/api/errors";
import { created, ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { listMedia, mediaKind, uploadFieldsSchema, uploadMedia } from "@/modules/media/service";

export const GET = adminRoute(async (req) => {
  const { kind } = parseQuery(req, z.object({ kind: mediaKind.optional() }));
  return ok(await listMedia(createAdminClient(), kind));
});

/** multipart/form-data: file, kind?, alt_text? */
export const POST = adminRoute(async (req, { admin }) => {
  // Cheap early rejection before buffering the body (hard limit re-checked on the actual file).
  if (Number(req.headers.get("content-length") ?? 0) > 11 * 1024 * 1024) {
    throw new ApiError("payload_too_large", "Request body too large.");
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw errors.badRequest("Expected a 'file' field.");
  const fields = uploadFieldsSchema.parse({
    kind: form.get("kind") ?? undefined,
    alt_text: form.get("alt_text") ?? undefined,
  });
  return created(await uploadMedia(createAdminClient(), file, fields, admin.userId));
});
