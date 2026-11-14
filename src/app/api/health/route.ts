import { ok } from "@/lib/api/response";

/** Liveness only. Reveals nothing about configuration. Detailed checks: /api/admin/system/status. */
export const GET = () => ok({ status: "ok", time: new Date().toISOString() });
