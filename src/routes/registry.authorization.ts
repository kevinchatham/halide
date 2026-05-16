import type { Context } from 'hono';
import type { AuthorizeFn } from '../types/api';
import type { HalideContext, RequestContext } from '../types/app';
import { createAuthErrorResponse } from './registry.claims';

/**
 * Check authorization by calling the route's authorize function, returning a
 * 403 response if denied.
 *
 * Returns null immediately when no authorize function is configured on the route.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param c - The Hono context.
 * @param route - The route with an optional authorize function.
 * @param app - The bundled app context.
 * @param _body - The parsed request body for authorization checks.
 * @param ctx - Pre-built request context to avoid recreation.
 * @returns A 403 response if authorization is denied, or null to continue processing.
 */
export async function checkAuthorization<TClaims = unknown, TLogScope = unknown>(
  c: Context,
  route: { authorize?: AuthorizeFn<TClaims, TLogScope> },
  app: HalideContext<TClaims, TLogScope>,
  _body: unknown,
  ctx: RequestContext,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const allowed = await route.authorize(ctx, app);
    if (!allowed) {
      return createAuthErrorResponse(c, 403, 'Forbidden');
    }
    return null;
  } catch {
    return createAuthErrorResponse(c, 403, 'Forbidden');
  }
}
