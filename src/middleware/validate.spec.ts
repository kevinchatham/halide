import type { Request, Response } from 'express';
import { z } from 'zod';
import { createBodyValidationMiddleware } from './validate';

function createMockRequest(method: string, body: unknown): Request {
  return { body, method } as unknown as Request;
}

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('createBodyValidationMiddleware', () => {
  it('should skip validation for GET requests', () => {
    const schema = z.object({ name: z.string() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('GET', { invalid: true });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should skip validation for DELETE requests', () => {
    const schema = z.object({ name: z.string() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('DELETE', { invalid: true });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should skip validation for HEAD requests', () => {
    const schema = z.object({ name: z.string() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('HEAD', { invalid: true });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should skip validation for OPTIONS requests', () => {
    const schema = z.object({ name: z.string() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('OPTIONS', { invalid: true });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should validate POST request body and pass on success', () => {
    const schema = z.object({ name: z.string() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('POST', { name: 'test' });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'test' });
  });

  it('should return 400 on validation failure', () => {
    const schema = z.object({ name: z.string() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('POST', { name: 123 });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toHaveLength(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('should validate PUT request body', () => {
    const schema = z.object({ id: z.number() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('PUT', { id: 42 });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ id: 42 });
  });

  it('should validate PATCH request body', () => {
    const schema = z.object({ email: z.string().email() });
    const middleware = createBodyValidationMiddleware(schema);
    const req = createMockRequest('PATCH', { email: 'test@example.com' });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'test@example.com' });
  });
});
