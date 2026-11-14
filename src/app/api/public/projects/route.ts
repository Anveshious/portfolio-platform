import { publicRoute } from "@/lib/api/handler";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { ok } from "@/lib/api/response";
import { createPublicClient } from "@/lib/database/clients";
import { listPublicProjects } from "@/modules/projects/service";

export const GET = publicRoute(async () => {
  const data = await listPublicProjects(createPublicClient());
  return ok(data, { headers: PUBLIC_CACHE });
});
