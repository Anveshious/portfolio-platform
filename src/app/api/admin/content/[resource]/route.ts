import { adminRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/database/clients";
import { createItem, listAll, resolveResource } from "@/modules/content/registry";

type P = { resource: string };

/** resource ∈ skills | achievements | experiences | opportunities | socials | activities */
export const GET = adminRoute<P>(async (_r, { params }) => ok(await listAll(createAdminClient(), resolveResource((await params).resource))));

export const POST = adminRoute<P>(async (req, { params }) => {
  const resource = resolveResource((await params).resource);
  let body: unknown;
  try { body = await req.json(); } catch { throw errors.badRequest("Request body must be valid JSON."); }
  return created(await createItem(createAdminClient(), resource, body));
});
