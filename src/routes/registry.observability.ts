import type { Context } from 'hono';
import { asInternalLogger } from '../config/defaults';
import type { HalideContext, Logger, ObservabilityConfig, RequestContext } from '../types/app';

/**
 * Context object capturing error, start time, and status code for the onResponse hook.
 */
export interface ResponseEmitContext {
  /** Error thrown by the handler during request processing, if any. */
  handlerError: Error | undefined;
  /** Timestamp (Date.now()) when request processing started. */
  start: number;
  /** HTTP status code of the final response. */
  statusCode: number;
}

/**
 * Common emit configuration shared between onRequest and onResponse hooks.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
interface EmitConfig<TClaims = unknown, TLogScope = unknown> {
  /** The bundled app context. */
  app: HalideContext<TClaims, TLogScope>;
  /** The parsed request body. */
  body: unknown;
  /** The Hono context. */
  c: Context;
  /** Logger instance for reporting hook errors. */
  logger?: Logger<TLogScope>;
  /** The observability configuration. */
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined;
  /** Whether observability is enabled for this specific route. */
  observe: boolean | undefined;
}

/**
 * Extended emit configuration for the onResponse hook.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
interface ResponseEmitConfig<TClaims = unknown, TLogScope = unknown>
  extends EmitConfig<TClaims, TLogScope> {
  /** Set to 'text' for proxy route response bodies. */
  bodyType?: 'text' | 'binary';
  /** The response emit context with error, start time, and status code. */
  emitCtx: ResponseEmitContext;
  /** The captured response body for logging. */
  responseBody?: unknown;
}

/**
 * Emit the onRequest observability hook if configured and not disabled on the route.
 *
 * Skips the hook when `observe` is false or when no `onRequest` hook is configured
 * in {@link ObservabilityConfig}. Wraps callback invocations in try/catch so that
 * hook errors don't silently fail or disrupt request processing.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The emit configuration.
 * @param ctx - Pre-built request context.
 */
export function emitOnRequest<TClaims = unknown, TLogScope = unknown>(
  config: EmitConfig<TClaims, TLogScope>,
  ctx: RequestContext,
): void {
  const il = config.logger ? asInternalLogger(config.logger) : undefined;
  if (config.observability?.onRequest && config.observe !== false) {
    try {
      const result = config.observability.onRequest(ctx, config.app);
      if (result instanceof Promise) {
        result.catch((err) =>
          il?.error({}, `onRequest hook: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    } catch (err) {
      il?.error({}, `onRequest hook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Emit the onResponse observability hook if configured and not disabled on the route.
 *
 * Skips the hook when `observe` is false or when no `onResponse` hook is configured
 * in {@link ObservabilityConfig}. Computes the response duration from the start
 * timestamp and wraps callback invocations in try/catch so that hook errors don't
 * silently fail or disrupt request processing.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The emit configuration.
 * @param ctx - Pre-built request context.
 */
export function emitOnResponse<TClaims = unknown, TLogScope = unknown>(
  config: ResponseEmitConfig<TClaims, TLogScope>,
  ctx: RequestContext,
): void {
  const il = config.logger ? asInternalLogger(config.logger) : undefined;
  if (config.observability?.onResponse && config.observe !== false) {
    try {
      const result = config.observability.onResponse(ctx, config.app, {
        body: config.responseBody,
        bodyType: config.bodyType,
        durationMs: Date.now() - config.emitCtx.start,
        error: config.emitCtx.handlerError,
        statusCode: config.emitCtx.statusCode,
      });
      if (result instanceof Promise) {
        result.catch((err) =>
          il?.error({}, `onResponse hook: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    } catch (err) {
      il?.error({}, `onResponse hook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
