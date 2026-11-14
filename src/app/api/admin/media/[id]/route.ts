import { adminRoute } from "@/lib/api/handler";
import { noContent, ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { deleteMedia, getMedia } from "@/modules/media/service";

type P = { id: string };

export const GET = adminRoute<P>(async (_r, { params }) => ok(await getMedia(createAdminClient(), uuid.parse((await params).id))));
export const DELETE = adminRoute<P>(async (_r, { params }) => {
  await deleteMedia(createAdminClient(), uuid.parse((await params).id));
  return noContent();
});
