import { adminRoute } from "@/lib/api/handler";
import { noContent, ok } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/database/clients";
import { uuid } from "@/lib/validation/common";
import { deleteItem, resolveResource, updateItem } from "@/modules/content/registry";

type P = { resource: string; id: string };

export const PATCH = adminRoute<P>(async (req, { params }) => {
  const { resource, id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { throw errors.badRequest("Request body must be valid JSON."); }
  return ok(await updateItem(createAdminClient(), resolveResource(resource), uuid.parse(id), body));
});

export const DELETE = adminRoute<P>(async (_r, { params }) => {
  const { resource, id } = await params;
  await deleteItem(createAdminClient(), resolveResource(resource), uuid.parse(id));
  return noContent();
});
