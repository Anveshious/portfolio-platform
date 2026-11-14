import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { created, noContent } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { attachMediaSchema, detachMediaSchema } from "@/modules/projects/schema";
import { attachMedia, detachMedia } from "@/modules/projects/service";

type P = { id: string };

export const POST = adminRoute<P>(async (req, { params }) =>
  created(await attachMedia(createAdminClient(), uuid.parse((await params).id), await parseJson(req, attachMediaSchema))),
);

export const DELETE = adminRoute<P>(async (req, { params }) => {
  const { project_media_id } = await parseJson(req, detachMediaSchema);
  await detachMedia(createAdminClient(), uuid.parse((await params).id), project_media_id);
  return noContent();
});
