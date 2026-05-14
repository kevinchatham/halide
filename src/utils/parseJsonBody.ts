import type { Context } from 'hono';

/**
 * Parse JSON from the request body, returning a 400 response on malformed JSON.
 * @param c - The Hono context.
 * @returns The parsed body, or a 400 `Response` on malformed JSON.
 */
export async function parseJsonBody(c: Context): Promise<unknown | Response> {
  try {
    return await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }
}
