import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { noContent } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { reorderSchema } from "@/modules/projects/schema";
import { reorderProjects } from "@/modules/projects/service";

export const PUT = adminRoute(async (req) => {
  await reorderProjects(createAdminClient(), (await parseJson(req, reorderSchema)).items);
  return noContent();
});
