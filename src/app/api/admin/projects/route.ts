import { adminRoute } from "@/lib/api/handler";
import { parseJson, parseQuery } from "@/lib/api/request";
import { created, ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { adminProjectListQuery, createProjectSchema } from "@/modules/projects/schema";
import { createProject, listAdminProjects } from "@/modules/projects/service";

export const GET = adminRoute(async (req) => ok(await listAdminProjects(createAdminClient(), parseQuery(req, adminProjectListQuery))));

export const POST = adminRoute(async (req) =>
  created(await createProject(createAdminClient(), await parseJson(req, createProjectSchema))),
);
