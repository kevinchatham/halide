import type { ZodSchema } from 'zod';
import type { OpenApiRouteMeta } from '../types';

/** Computed return type of {@link inferSchema}, varying based on whether a request schema is provided. */
type InferSchemaResult<
  TRequest extends ZodSchema | undefined,
  TResponse extends ZodSchema | undefined,
> = TRequest extends ZodSchema
  ? {
      validationSchema: TRequest;
      openapi: Pick<OpenApiRouteMeta, 'requestSchema' | 'responseSchema'> & {
        requestSchema: TRequest;
        responseSchema: TResponse extends ZodSchema ? TResponse : never;
      };
    }
  : { openapi?: Pick<OpenApiRouteMeta, 'requestSchema' | 'responseSchema'> };

/**
 * Creates a route input object with validationSchema and/or openapi schemas
 * populated from Zod schemas, eliminating duplication.
 *
 * @typeParam TRequest - Zod schema for the request body, or undefined.
 * @typeParam TResponse - Zod schema for the response body, or undefined.
 * @param request - Zod schema used for both body validation and OpenAPI request documentation.
 * @param response - Zod schema for OpenAPI response documentation only.
 * @returns An object with `validationSchema` and `openapi` fields to spread into an {@link apiRoute} call.
 *
 * @example
 * ```ts
 * const requestSchema = z.object({ email: z.string().email(), name: z.string() });
 * const responseSchema = z.object({ id: z.string(), email: z.string() });
 *
 * apiRoute({
 *   access: 'public',
 *   handler: async (ctx) => ({ ok: true }),
 *   method: 'post',
 *   path: '/users',
 *   ...inferSchema(requestSchema, responseSchema),
 * });
 * ```
 */
export function inferSchema<
  TRequest extends ZodSchema | undefined = undefined,
  TResponse extends ZodSchema | undefined = undefined,
>(request?: TRequest, response?: TResponse): InferSchemaResult<TRequest, TResponse> {
  const result: {
    validationSchema?: ZodSchema;
    openapi?: Pick<OpenApiRouteMeta, 'requestSchema' | 'responseSchema'>;
  } = {};

  if (request) {
    result.validationSchema = request;
    result.openapi = {
      ...(request ? { requestSchema: request } : {}),
      ...(response ? { responseSchema: response } : {}),
    };
  } else if (response) {
    result.openapi = {
      ...(response ? { responseSchema: response } : {}),
    };
  }

  return result as InferSchemaResult<TRequest, TResponse>;
}
