import { ApiError } from "@/lib/api/errors";

type PgError = { code?: string; message: string; details?: string | null };

/** Unwrap a Supabase result, translating Postgres errors into ApiErrors. */
export function unwrap<T>(result: { data: T; error: PgError | null }): T {
  if (!result.error) return result.data;
  const { code, message } = result.error;
  switch (code) {
    case "23505":
      throw new ApiError("conflict", "A record with these unique values already exists.");
    case "23503":
      throw new ApiError("bad_request", "Referenced record does not exist or is still in use.");
    case "23514":
      throw new ApiError("validation_failed", "A database rule rejected this change.", message);
    case "22P02":
      throw new ApiError("bad_request", "Malformed identifier or value.");
    case "PGRST116":
      throw new ApiError("not_found", "Resource not found.");
    default:
      console.error("Database error:", result.error);
      throw new ApiError("internal_error", "Database operation failed.");
  }
}
