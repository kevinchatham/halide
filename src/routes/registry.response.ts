import type { Context } from 'hono';
import type { ObservabilityConfig } from '../types/app';
import { collectProxyBody } from './proxy-body';

/**
 * Result of response body collection with streaming.
 */
export type PipeResult = {
  /** The piped response (or original if no body). */
  response: Response;
  /** Collected body text (undefined if no body or aborted). */
  body: string | undefined;
  /** Whether the client disconnected during collection. */
  aborted: boolean;
  /** Error from reading the body stream, if any. */
  pipeError?: Error;
};

/**
 * Pipe a response body while collecting bytes for observability.
 *
 * When `observe` is false or the response has no body, returns the original
 * response unchanged. Otherwise, tees the stream, reads up to maxCollect
 * bytes, and handles client disconnect (499 status).
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param c - The Hono context.
 * @param response - The response to pipe.
 * @param observability - The observability configuration.
 * @param observe - Whether observability is enabled for this route.
 * @returns The pipe result with collected body and potential errors.
 */
export async function observeAndPipeResponse<TClaims = unknown, TLogScope = unknown>(
  c: Context,
  response: Response,
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined,
  observe: boolean | undefined,
): Promise<PipeResult> {
  if (observe === false || !response.body) {
    return { aborted: false, body: undefined, response };
  }

  const abortController = new AbortController();
  c.req.raw?.signal?.addEventListener('abort', () => abortController.abort(), { once: true });

  const maxCollect = observability?.maxCollect ?? 1024;
  const {
    response: pipedResponse,
    body: responseBodyText,
    error: collectedPipeError,
  } = await collectProxyBody(response, abortController.signal, maxCollect);

  if (abortController.signal.aborted) {
    return {
      aborted: true,
      body: undefined,
      pipeError: collectedPipeError,
      response: pipedResponse,
    };
  }

  return {
    aborted: false,
    body: responseBodyText,
    pipeError: collectedPipeError,
    response: pipedResponse,
  };
}
