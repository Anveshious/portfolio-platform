import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { noContent, ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { updateProjectSchema } from "@/modules/projects/schema";
import { deleteProject, getAdminProject, updateProject } from "@/modules/projects/service";

type P = { id: string };

export const GET = adminRoute<P>(async (_r, { params }) => ok(await getAdminProject(createAdminClient(), uuid.parse((await params).id))));

export const PATCH = adminRoute<P>(async (req, { params }) =>
  ok(await updateProject(createAdminClient(), uuid.parse((await params).id), await parseJson(req, updateProjectSchema))),
);

export const DELETE = adminRoute<P>(async (_r, { params }) => {
  await deleteProject(createAdminClient(), uuid.parse((await params).id));
  return noContent();
});
