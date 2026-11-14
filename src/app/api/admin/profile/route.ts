import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { createAdminClient } from "@/lib/database/clients";
import { getAdminProfile, profileSchema, upsertProfile } from "@/modules/profile/service";

export const GET = adminRoute(async () => ok(await getAdminProfile(createAdminClient())));
export const PUT = adminRoute(async (req) => ok(await upsertProfile(createAdminClient(), await parseJson(req, profileSchema))));
