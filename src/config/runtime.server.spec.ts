import net from 'node:net';
import { createServer } from './runtime';

function getFreePort(): number {
  const server = net.createServer();
  server.listen(0);
  const address = server.address() as net.AddressInfo;
  const port = address.port;
  server.close();
  return port;
}

const minimalConfig = { spa: { root: '/var/www' } } as const;

describe('createServer', () => {
  it('returns a server object with start and stop methods', async () => {
    const server = createServer(minimalConfig);
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('starts and stops without error', async () => {
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
  });

  it('logs startup with custom spa.name', async () => {
    const infoMessages: string[] = [];
    const server = createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, name: 'my-app', port: getFreePort() },
    });
    server.start();
    await server.stop();
    expect(infoMessages.length).toBe(1);
    expect(infoMessages[0]).toContain('my-app');
  });

  it('logs startup with default spa.name', async () => {
    const infoMessages: string[] = [];
    const server = createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
    expect(infoMessages[0]).toContain('app');
  });

  it('resolves port from process.env.PORT', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = '48921';
    try {
      const infoMessages: string[] = [];
      const server = createServer({
        ...minimalConfig,
        observability: {
          logger: {
            debug: () => {},
            error: () => {},
            info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
            warn: () => {},
          },
        },
      });
      server.start();
      await server.stop();
      expect(infoMessages[0]).toContain('48921');
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });

  it('falls back to config port when PORT env is invalid', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = 'not-a-number';
    try {
      const infoMessages: string[] = [];
      const server = createServer({
        ...minimalConfig,
        observability: {
          logger: {
            debug: () => {},
            error: () => {},
            info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
            warn: () => {},
          },
        },
        spa: { ...minimalConfig.spa, port: 3999 },
      });
      server.start();
      await server.stop();
      expect(infoMessages[0]).toContain('3999');
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });

  it('stop resolves gracefully when server was never started', async () => {
    const server = createServer(minimalConfig);
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('registers SIGINT and SIGTERM handlers after start', async () => {
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    onSpy.mockRestore();
  });

  it('does not register signal handlers before start', async () => {
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const _server = createServer(minimalConfig);
    const sigintCalls = onSpy.mock.calls.filter((c) => c[0] === 'SIGINT');
    const sigtermCalls = onSpy.mock.calls.filter((c) => c[0] === 'SIGTERM');
    expect(sigintCalls.length).toBe(0);
    expect(sigtermCalls.length).toBe(0);
    onSpy.mockRestore();
  });

  it('prevents double shutdown when stop is called before signal', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('calls onReady callback with port when server starts', async () => {
    const port = getFreePort();
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port },
    });
    let receivedPort: number | undefined;
    server.start((p) => {
      receivedPort = p;
    });
    await server.ready;
    await server.stop();
    expect(receivedPort).toBe(port);
  });

  it('logs shutdown message and exits on SIGTERM signal', async () => {
    const infoMessages: string[] = [];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const port = getFreePort();
    const server = createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, name: 'test-app', port },
    });
    server.start();
    const sigtermHandler = onSpy.mock.calls.find((c: unknown[]) => c[0] === 'SIGTERM')?.[1] as
      | (() => void)
      | undefined;
    if (sigtermHandler) {
      sigtermHandler();
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(infoMessages.some((msg) => msg.includes('SIGTERM'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('logs shutdown message and exits on SIGINT signal', async () => {
    const infoMessages: string[] = [];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const port = getFreePort();
    const server = createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, name: 'test-app', port },
    });
    server.start();
    const sigintHandler = onSpy.mock.calls.find((c: unknown[]) => c[0] === 'SIGINT')?.[1] as
      | (() => void)
      | undefined;
    if (sigintHandler) {
      sigintHandler();
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(infoMessages.some((msg) => msg.includes('SIGINT'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
