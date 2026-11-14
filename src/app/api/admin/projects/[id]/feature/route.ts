import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { featureActionSchema } from "@/modules/projects/schema";
import { setFeatured } from "@/modules/projects/service";

export const POST = adminRoute<{ id: string }>(async (req, { params }) => {
  const { featured } = await parseJson(req, featureActionSchema);
  return ok(await setFeatured(createAdminClient(), uuid.parse((await params).id), featured));
});
