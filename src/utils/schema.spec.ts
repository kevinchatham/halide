import { z } from 'zod';
import { inferSchema } from './schema';

describe('inferSchema', () => {
  it('returns validationSchema and openapi.requestSchema from request schema', () => {
    const requestSchema = z.object({ email: z.string().email(), name: z.string() });
    const result = inferSchema(requestSchema);

    expect(result).toHaveProperty('validationSchema');
    expect(result).toHaveProperty('openapi');
    expect(result.openapi).toHaveProperty('requestSchema');
    expect(result.validationSchema).toBe(requestSchema);
    expect(result.openapi?.requestSchema).toBe(requestSchema);
  });

  it('returns openapi.responseSchema from response schema', () => {
    const responseSchema = z.object({ email: z.string(), id: z.string() });
    const result = inferSchema(undefined, responseSchema);

    expect(result).not.toHaveProperty('validationSchema');
    expect(result.openapi).toHaveProperty('responseSchema');
    expect(result.openapi?.responseSchema).toBe(responseSchema);
  });

  it('returns both request and response schemas', () => {
    const requestSchema = z.object({ email: z.string().email() });
    const responseSchema = z.object({ email: z.string(), id: z.string() });
    const result = inferSchema(requestSchema, responseSchema);

    expect(result.validationSchema).toBe(requestSchema);
    expect(result.openapi?.requestSchema).toBe(requestSchema);
    expect(result.openapi?.responseSchema).toBe(responseSchema);
  });

  it('returns empty object when no schemas provided', () => {
    const result = inferSchema();
    expect(result).toEqual({});
  });

  it('can be spread into an apiRoute input', () => {
    const requestSchema = z.object({ id: z.number() });
    const responseSchema = z.object({ created: z.boolean() });
    const routeInput = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'post' as const,
      path: '/test',
      ...inferSchema(requestSchema, responseSchema),
    };

    expect(routeInput.validationSchema).toBe(requestSchema);
    expect(routeInput.openapi?.requestSchema).toBe(requestSchema);
    expect(routeInput.openapi?.responseSchema).toBe(responseSchema);
  });
});
