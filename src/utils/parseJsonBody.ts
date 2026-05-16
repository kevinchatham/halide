import type { Context } from 'hono';

/**
 * Error codes for JSON body parsing failures.
 * - `'EMPTY_BODY'` — Request body was empty.
 * - `'MALFORMED_JSON'` — Body contained invalid JSON syntax.
 * - `'PARSE_ERROR'` — Generic parse failure (non-SyntaxError).
 */
export type BodyParseErrorCode = 'EMPTY_BODY' | 'MALFORMED_JSON' | 'PARSE_ERROR';

/**
 * Error thrown when JSON body parsing fails.
 *
 * Carries a descriptive `message`, a {@link BodyParseErrorCode} for programmatic
 * handling, and the original error as `cause`. Always has `status: 400`.
 */
export class BodyParseError extends Error {
  public readonly status: number;
  public readonly code: BodyParseErrorCode;

  constructor(message: string, code: BodyParseErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BodyParseError';
    this.status = 400;
    this.code = code;
  }
}

/**
 * Parse JSON from the request body, throwing a BodyParseError on malformed JSON.
 * @param c - The Hono context.
 * @returns The parsed body.
 */
export async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (err) {
    const cause = err instanceof Error ? err : new Error(String(err));
    const msg = cause.message || '';
    if (cause instanceof SyntaxError) {
      if (msg.includes('Unexpected end of JSON input')) {
        throw new BodyParseError('Request body is empty', 'EMPTY_BODY', { cause });
      }
      throw new BodyParseError('Malformed JSON in request body', 'MALFORMED_JSON', { cause });
    }
    throw new BodyParseError('Failed to parse request body', 'PARSE_ERROR', { cause });
  }
}
