import { observeAndPipeResponse } from './registry.response';

function slowBody(chunks: string[]): ReadableStream {
  let i = 0;
  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController<unknown>): Promise<void> {
      if (i < chunks.length) {
        await new Promise((r) => setTimeout(r, 50));
        const encoder = new TextEncoder();
        const data = encoder.encode(chunks[i]);
        controller.enqueue(data);
        i++;
      } else {
        controller.close();
      }
    },
  });
}

describe('observeAndPipeResponse', () => {
  it('returns original response when observe === false', async () => {
    const originalResponse = new Response('hello');
    const result = await observeAndPipeResponse(
      {} as unknown as Parameters<typeof observeAndPipeResponse>[0],
      originalResponse,
      {} as unknown as Parameters<typeof observeAndPipeResponse>[2],
      false,
    );
    expect(result.response).toBe(originalResponse);
    expect(result.aborted).toBe(false);
    expect(result.body).toBeUndefined();
  });

  it('returns original response when response has no body', async () => {
    const originalResponse = new Response(null, { status: 204 });
    const result = await observeAndPipeResponse(
      {} as unknown as Parameters<typeof observeAndPipeResponse>[0],
      originalResponse,
      {} as unknown as Parameters<typeof observeAndPipeResponse>[2],
      true,
    );
    expect(result.response).toBe(originalResponse);
    expect(result.aborted).toBe(false);
    expect(result.body).toBeUndefined();
  });

  it('pipes body and collects bytes when observing', async () => {
    const requestBody = 'Hello, world!';
    const originalResponse = new Response(requestBody);
    const result = await observeAndPipeResponse(
      { req: { raw: new Request('http://localhost/') } } as unknown as Parameters<
        typeof observeAndPipeResponse
      >[0],
      originalResponse,
      {} as unknown as Parameters<typeof observeAndPipeResponse>[2],
      true,
    );
    expect(result.aborted).toBe(false);
    expect(result.body).toBe(requestBody);
    expect(result.response).not.toBe(originalResponse);
  });

  it('returns aborted=true on client disconnect', async () => {
    const abortController = new AbortController();
    const chunks = Array.from({ length: 30 }, () => 'Y'.repeat(1000));

    const originalResponse = new Response(slowBody(chunks));
    const promise = observeAndPipeResponse(
      {
        req: { raw: new Request('http://localhost/', { signal: abortController.signal }) },
      } as unknown as Parameters<typeof observeAndPipeResponse>[0],
      originalResponse,
      {} as unknown as Parameters<typeof observeAndPipeResponse>[2],
      true,
    );

    await new Promise((r) => setTimeout(r, 100));
    abortController.abort();

    const result = await promise;
    expect(result.aborted).toBe(true);
    expect(result.body).toBeUndefined();
  });

  it('respects maxCollect limit', async () => {
    const requestBody = 'A'.repeat(2000);
    const originalResponse = new Response(requestBody);
    const result = await observeAndPipeResponse(
      { req: { raw: new Request('http://localhost/') } } as unknown as Parameters<
        typeof observeAndPipeResponse
      >[0],
      originalResponse,
      { maxCollect: 100 } as unknown as Parameters<typeof observeAndPipeResponse>[2],
      true,
    );
    expect(result.aborted).toBe(false);
    expect(result.body).toBeDefined();
    expect(result.body!.length).toBeLessThanOrEqual(100);
  });

  it('returns undefined when response body is empty', async () => {
    const originalResponse = new Response('');
    const result = await observeAndPipeResponse(
      { req: { raw: new Request('http://localhost/') } } as unknown as Parameters<
        typeof observeAndPipeResponse
      >[0],
      originalResponse,
      {} as unknown as Parameters<typeof observeAndPipeResponse>[2],
      true,
    );
    expect(result.aborted).toBe(false);
    expect(result.body).toBeUndefined();
  });
});
