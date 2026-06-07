import { Hono } from 'hono';
import { createAgentCache, createProxyService } from '../services/proxy';
import { createTestApp } from '../test-utils/index.js';
import { registerRoutes } from './registry';
import { observeAndPipeResponse } from './registry.response';

vi.mock('../services/proxy', async () => {
  const actual = await vi.importActual<typeof import('../services/proxy')>('../services/proxy');
  return {
    ...(actual as object),
    createProxyService: vi.fn(),
  };
});

vi.mock('./registry.response', () => ({
  observeAndPipeResponse: vi.fn(),
}));

describe('Proxy handler edge cases', () => {
  beforeEach(() => {
    vi.mocked(createProxyService).mockClear();
    vi.mocked(observeAndPipeResponse).mockClear();
  });

  it('handles client disconnect (aborted pipe result)', async () => {
    const onResponse = vi.fn();
    const abortError = new Error('Connection aborted');
    const mockProxyHandler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler);
    vi.mocked(observeAndPipeResponse).mockResolvedValue({
      aborted: true,
      body: undefined,
      pipeError: abortError,
      response: new Response(null, { status: 200 }),
    });

    const app = await createTestApp({
      app: { root: '/var/www' },
      observability: {
        maxCollect: 100,
        onResponse,
      },
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/abort-test',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
    });

    await app.request('/abort-test');
    expect(onResponse).toHaveBeenCalledTimes(1);
    const emitCtx = onResponse.mock.calls?.[0]?.[2];
    expect(emitCtx?.statusCode).toBe(499);
    expect(emitCtx?.error?.message).toBe('Client disconnected');
  });

  it('handles pipe error without handler error (502)', async () => {
    const onResponse = vi.fn();
    const pipeErr = new Error('Pipe read failed');
    const mockProxyHandler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler);
    vi.mocked(observeAndPipeResponse).mockResolvedValue({
      aborted: false,
      body: undefined,
      pipeError: pipeErr,
      response: new Response(null, { status: 200 }),
    });

    const app = await createTestApp({
      app: { root: '/var/www' },
      observability: {
        maxCollect: 100,
        onResponse,
      },
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/pipe-error-test',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
    });

    await app.request('/pipe-error-test');
    expect(onResponse).toHaveBeenCalledTimes(1);
    const emitCtx = onResponse.mock.calls?.[0]?.[2];
    expect(emitCtx?.statusCode).toBe(502);
    expect(emitCtx?.error).toBe(pipeErr);
  });
});
