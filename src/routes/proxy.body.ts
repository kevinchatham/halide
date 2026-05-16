/**
 * Collect bytes from a proxy response body while piping the stream through.
 *
 * Splits the response body with tee() so the client receives data as chunks
 * arrive without waiting for the full body to buffer. One branch is returned
 * for the client; the other is read up to `maxCollect` bytes for observability.
 *
 * @param response - The original proxy response.
 * @param signal - Abort signal for client disconnect detection.
 * @param maxCollect - Maximum bytes to collect for observability.
 * @returns Promise resolving to `{ response, body, error }` — the new piped Response, collected body text, or error.
 */
export async function collectProxyBody(
  response: Response,
  signal: AbortSignal,
  maxCollect: number,
): Promise<{ body: string | undefined; error?: Error; response: Response }> {
  const body = response.body;

  if (!body) {
    return { body: undefined, response };
  }

  const [pipedBody, collectionBody] = body.tee();

  const collected: Uint8Array[] = [];
  let collectedBytes = 0;
  let collectError: Error | undefined;

  const reader = collectionBody.getReader();

  // Cancel the collection reader when the caller aborts, unblocking any pending read.
  const onAbort = (): void => {
    reader.cancel().catch(() => {});
  };
  if (!signal.aborted) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (collectedBytes < maxCollect) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      // Check again after the async read in case abort fired while waiting.
      if (signal.aborted) break;
      const end = Math.min(value.length, maxCollect - collectedBytes);
      collected.push(value.slice(0, end));
      collectedBytes += end;
    }
  } catch (err) {
    collectError = err instanceof Error ? err : new Error(String(err));
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.cancel().catch(() => {});
  }

  const responseBodyText =
    collected.length > 0 ? await new Response(new Blob(collected as BlobPart[])).text() : undefined;

  return {
    body: responseBodyText,
    error: collectError,
    response: new Response(pipedBody, {
      headers: response.headers,
      status: response.status,
    }),
  };
}
