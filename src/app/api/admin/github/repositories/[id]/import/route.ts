import { adminRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { importRepositorySchema } from "@/modules/projects/schema";
import { importRepository } from "@/modules/projects/service";

export const POST = adminRoute<{ id: string }>(async (req, { params }) => {
  const text = await req.text();
  const overrides = text ? importRepositorySchema.parse(JSON.parse(text)) : {};
  return created(await importRepository(createAdminClient(), uuid.parse((await params).id), overrides));
});
