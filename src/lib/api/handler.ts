import { fail } from "./response";
import { requireAdmin, type AdminContext } from "@/lib/auth/guards";

type Ctx<P> = { params: Promise<P> };

/** Public route wrapper: centralised error handling only. No auth, no admin client. */
export function publicRoute<P = Record<string, string>>(
  handler: (request: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (request: Request, ctx: Ctx<P>) => {
    try {
      return await handler(request, ctx);
    } catch (error) {
      return fail(error);
    }
  };
}

/**
 * Admin route wrapper. The session is verified server-side on EVERY request
 * before the handler runs; handlers receive the verified AdminContext.
 */
export function adminRoute<P = Record<string, string>>(
  handler: (request: Request, ctx: Ctx<P> & { admin: AdminContext }) => Promise<Response>,
) {
  return async (request: Request, ctx: Ctx<P>) => {
    try {
      const admin = await requireAdmin();
      return await handler(request, { ...ctx, admin });
    } catch (error) {
      return fail(error);
    }
  };
}
