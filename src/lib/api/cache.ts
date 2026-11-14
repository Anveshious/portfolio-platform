/** Edge cache for public reads: fresh for 60s, served stale up to 5 min while revalidating. */
export const PUBLIC_CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
