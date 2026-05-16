import { collectProxyBody } from './proxy.body';

describe('collectProxyBody', () => {
  it('returns original response when body is null', async () => {
    const response = new Response(null);
    const signal = new AbortController().signal;
    const result = await collectProxyBody(response, signal, 1024);
    expect(result.response).toBe(response);
    expect(result.body).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('collects body text up to maxCollect', async () => {
    const bodyText = 'Hello, world! This is a test response body.';
    const response = new Response(bodyText);
    const signal = new AbortController().signal;
    const result = await collectProxyBody(response, signal, 100);
    expect(result.body).toBe(bodyText);
    expect(result.error).toBeUndefined();
  });

  it('truncates collected body at maxCollect', async () => {
    const bodyText = 'A'.repeat(200) + 'B'.repeat(100);
    const response = new Response(bodyText);
    const signal = new AbortController().signal;
    const result = await collectProxyBody(response, signal, 50);
    expect(result.body?.length).toBeLessThanOrEqual(50);
    expect(result.error).toBeUndefined();
  });

  it('propagates response headers and status', async () => {
    const response = new Response('ok', {
      headers: { 'Content-Type': 'text/plain', 'X-Custom': 'value' },
      status: 201,
    });
    const signal = new AbortController().signal;
    const result = await collectProxyBody(response, signal, 1024);
    expect(result.response.headers.get('Content-Type')).toBe('text/plain');
    expect(result.response.headers.get('X-Custom')).toBe('value');
    expect(result.response.status).toBe(201);
  });

  it('returns piped response body for reading', async () => {
    const bodyText = 'Piped body content';
    const response = new Response(bodyText);
    const signal = new AbortController().signal;
    const result = await collectProxyBody(response, signal, 1024);
    const pipedBody = await result.response.text();
    expect(pipedBody).toBe(bodyText);
  });

  it('returns response with ReadableStream body', async () => {
    const bodyText = 'ReadableStream body';
    const response = new Response(bodyText);
    const signal = new AbortController().signal;
    const result = await collectProxyBody(response, signal, 1024);
    expect(result.response.body).toBeInstanceOf(ReadableStream);
  });

  it('handles client disconnect via abort signal before any read', async () => {
    const bodyText = 'Slow body';
    const response = new Response(bodyText);
    const controller = new AbortController();
    const resultPromise = collectProxyBody(response, controller.signal, 1024);
    controller.abort();
    const result = await resultPromise;
    expect(result.body).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('handles partial abort after first chunk', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller: ReadableStreamDefaultController<Uint8Array>): void {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          setTimeout(() => controller.enqueue(new TextEncoder().encode('chunk2')), 50);
          setTimeout(() => controller.close(), 100);
        },
      }),
    );
    const controller = new AbortController();
    const resultPromise = collectProxyBody(response, controller.signal, 1024);

    await new Promise((resolve) => setTimeout(resolve, 30));
    controller.abort();

    const result = await resultPromise;
    expect(result.body).toBe('chunk1');
    expect(result.error).toBeUndefined();
  });
});
