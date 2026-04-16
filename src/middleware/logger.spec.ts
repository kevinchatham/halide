import { createLoggerMiddleware } from './logger';

describe('createLoggerMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls next immediately', () => {
    const handler = createLoggerMiddleware('test-app');
    const next = vi.fn();

    const req = { method: 'GET', path: '/home' } as any;
    const res = { on: vi.fn() } as any;

    handler(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('registers a finish event listener on res', () => {
    const handler = createLoggerMiddleware('test-app');
    const resOnSpy = vi.fn();

    const req = { method: 'GET', path: '/home' } as any;
    const res = { on: resOnSpy, statusCode: 200 } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(resOnSpy).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('logs request details on finish event', () => {
    const handler = createLoggerMiddleware('my-app');
    let finishCallback: () => void;

    const req = { method: 'POST', path: '/api/users' } as any;
    const res = {
      on: vi.fn((_event, cb) => {
        finishCallback = cb;
      }),
      statusCode: 201,
    } as any;
    const next = vi.fn();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    handler(req, res, next);
    vi.setSystemTime(new Date('2024-01-01T00:00:00.150Z'));

    res.on.mock.calls[0][1]();

    expect(consoleSpy).toHaveBeenCalledWith('[my-app] POST /api/users 201 150ms');
  });

  it('uses the provided logger name', () => {
    const handler = createLoggerMiddleware('custom-name');

    const req = { method: 'GET', path: '/test' } as any;
    const res = {
      on: vi.fn(),
      statusCode: 404,
    } as any;
    const next = vi.fn();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    handler(req, res, next);
    vi.setSystemTime(new Date('2024-01-01T00:00:00.050Z'));

    res.on.mock.calls[0][1]();

    expect(consoleSpy).toHaveBeenCalledWith('[custom-name] GET /test 404 50ms');
  });
});
