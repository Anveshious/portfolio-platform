import { publicRoute } from "@/lib/api/handler";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { ok } from "@/lib/api/response";
import { createPublicClient } from "@/lib/database/clients";
import { slug as slugSchema } from "@/lib/validation/common";
import { getPublicProjectBySlug } from "@/modules/projects/service";

export const GET = publicRoute<{ slug: string }>(async (_req, { params }) => {
  const slug = slugSchema.parse((await params).slug);
  return ok(await getPublicProjectBySlug(createPublicClient(), slug), { headers: PUBLIC_CACHE });
});
