import { publicRoute } from "@/lib/api/handler";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { ok } from "@/lib/api/response";
import { createPublicClient } from "@/lib/database/clients";
import { listPublic } from "@/modules/content/registry";

export const GET = publicRoute(async () => {
  const data = await listPublic(createPublicClient(), "experiences");
  return ok(data, { headers: PUBLIC_CACHE });
});
