import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { publicationActionSchema } from "@/modules/projects/schema";
import { setPublication } from "@/modules/projects/service";

export const POST = adminRoute<{ id: string }>(async (req, { params }) => {
  const { action } = await parseJson(req, publicationActionSchema);
  return ok(await setPublication(createAdminClient(), uuid.parse((await params).id), action));
});
