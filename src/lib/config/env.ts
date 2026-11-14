import { z } from "zod";

/** Variables safe to expose to the browser. */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

/** Server-only variables. Never import this module from client components. */
const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_GITHUB_ID: z.string().regex(/^\d+$/, "ADMIN_GITHUB_ID must be the numeric GitHub account ID"),
  GITHUB_API_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/** Treat empty strings (placeholders in .env) as unset. */
function clean(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
}

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n- ${issues.join("\n- ")}`);
    this.name = "EnvError";
  }
}

function parse<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(clean(source));
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return result.data;
}

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

export function getPublicEnv(source: Record<string, string | undefined> = process.env): PublicEnv {
  if (source === process.env && cachedPublic) return cachedPublic;
  const value = parse(publicSchema, source);
  if (source === process.env) cachedPublic = value;
  return value;
}

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (source === process.env && cachedServer) return cachedServer;
  const value = parse(serverSchema, source);
  if (source === process.env) cachedServer = value;
  return value;
}

/** Test hook: process.env is static in production, but tests mutate it. */
export function resetEnvCache(): void {
  cachedPublic = undefined;
  cachedServer = undefined;
}
