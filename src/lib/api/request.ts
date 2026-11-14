import { z } from "zod";
import { errors } from "./errors";

/** Parse and validate a JSON request body. */
export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.badRequest("Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}
