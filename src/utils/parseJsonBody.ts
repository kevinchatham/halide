import type { Context } from 'hono';

export class BodyParseError extends Error {
  public readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = 'BodyParseError';
    this.status = 400;
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
  } catch {
    throw new BodyParseError('Invalid JSON in request body');
  }
}
