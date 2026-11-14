/**
 * Pure helpers for resolving the GitHub identity of a Supabase user.
 * Kept free of I/O so they are trivially testable.
 */
export type SupabaseUserLike = {
  id: string;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider: string; id?: string; identity_data?: Record<string, unknown> | null }> | null;
};

/** Returns the numeric GitHub account ID (as string) or null if the user did not sign in via GitHub. */
export function getGithubAccountId(user: SupabaseUserLike): string | null {
  const identity = user.identities?.find((i) => i.provider === "github");
  if (!identity) return null;
  const candidate = identity.identity_data?.provider_id ?? identity.identity_data?.sub ?? identity.id;
  if (candidate === undefined || candidate === null) return null;
  const asString = String(candidate);
  return /^\d+$/.test(asString) ? asString : null;
}

/**
 * Authorisation decision: the numeric GitHub ID must equal the configured admin ID.
 * Usernames are never consulted because they can change or be re-registered.
 */
export function isConfiguredAdmin(user: SupabaseUserLike, adminGithubId: string): boolean {
  const id = getGithubAccountId(user);
  return id !== null && id === adminGithubId;
}
