import { z } from "zod";
import { adminRoute } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { syncGithub } from "@/lib/services/github";

const bodySchema = z.object({ mode: z.enum(["initial", "manual"]).default("manual") }).default({ mode: "manual" });

export const POST = adminRoute(async (req) => {
  const text = await req.text();
  const { mode } = text ? await parseJson(new Request(req.url, { method: "POST", body: text }), bodySchema) : { mode: "manual" as const };
  const summary = await syncGithub(mode);
  if (summary.status === "failed") throw new ApiError("upstream_error", "GitHub synchronisation failed.", summary.errors);
  return ok(summary);
});
