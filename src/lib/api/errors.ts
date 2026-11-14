export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "upstream_error"
  | "misconfigured"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  upstream_error: 502,
  misconfigured: 503,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = STATUS[code];
  }
}

export const errors = {
  unauthenticated: () => new ApiError("unauthenticated", "Authentication required."),
  forbidden: () => new ApiError("forbidden", "You are not authorised to perform this action."),
  notFound: (what = "Resource") => new ApiError("not_found", `${what} not found.`),
  conflict: (message: string) => new ApiError("conflict", message),
  badRequest: (message: string, details?: unknown) => new ApiError("bad_request", message, details),
};
