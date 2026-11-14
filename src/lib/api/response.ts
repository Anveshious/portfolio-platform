import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";
import { EnvError } from "@/lib/config/env";

/**
 * Every API response uses one of two envelopes:
 *   success: { ok: true,  data, meta? }
 *   failure: { ok: false, error: { code, message, details? } }
 */
export type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };

const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit }) {
  const body: ApiSuccess<T> = { ok: true, data, ...(init?.meta ? { meta: init.meta } : {}) };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export function created<T>(data: T) {
  return ok(data, { status: 201, headers: NO_STORE });
}

export function noContent() {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return respond(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return respond(
      422,
      "validation_failed",
      "Request validation failed.",
      error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (error instanceof EnvError) {
    // Do not leak which variables are missing to callers; log server-side.
    console.error(error.message);
    return respond(503, "misconfigured", "Server is not configured correctly.");
  }
  console.error("Unhandled API error:", error);
  return respond(500, "internal_error", "Something went wrong.");
}

function respond(status: number, code: string, message: string, details?: unknown) {
  const body: ApiFailure = { ok: false, error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status, headers: NO_STORE });
}
