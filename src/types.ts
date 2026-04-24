import type { Context } from 'hono';
import type { ContentSecurityPolicyOptionHandler } from 'hono/secure-headers';
import type { ZodSchema } from 'zod';

export type ClaimExtractor<TClaims = unknown> = (c: Context) => Promise<TClaims | null>;

export type CspDirectiveValue = string | ContentSecurityPolicyOptionHandler;

export type CspDirectives = {
  baseUri?: CspDirectiveValue[];
  childSrc?: CspDirectiveValue[];
  connectSrc?: CspDirectiveValue[];
  defaultSrc?: CspDirectiveValue[];
  fontSrc?: CspDirectiveValue[];
  formAction?: CspDirectiveValue[];
  frameAncestors?: CspDirectiveValue[];
  frameSrc?: CspDirectiveValue[];
  imgSrc?: CspDirectiveValue[];
  manifestSrc?: CspDirectiveValue[];
  mediaSrc?: CspDirectiveValue[];
  objectSrc?: CspDirectiveValue[];
  sandbox?: CspDirectiveValue[];
  scriptSrc?: CspDirectiveValue[];
  scriptSrcAttr?: CspDirectiveValue[];
  scriptSrcElem?: CspDirectiveValue[];
  styleSrc?: CspDirectiveValue[];
  styleSrcAttr?: CspDirectiveValue[];
  styleSrcElem?: CspDirectiveValue[];
  upgradeInsecureRequests?: CspDirectiveValue[];
  workerSrc?: CspDirectiveValue[];
};

export type CspOptions = {
  directives?: CspDirectives;
};

export type OpenApiRouteMeta = {
  summary?: string;
  description?: string;
  tags?: string[];
  schemaName?: string;
  requestSchemaName?: string;
  responseSchema?: ZodSchema;
  responses?: Record<number, { description: string; schema?: ZodSchema }>;
};

export type RequestContext = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  path: string;
  headers: Record<string, string | string[]>;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body?: unknown;
};

export type ResponseContext = {
  statusCode: number;
  durationMs: number;
  error?: Error;
};

export type Logger = {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

export type ApiRouteHandler<TClaims, TBody = unknown> = (
  ctx: RequestContext & { body: TBody },
  claims: TClaims | undefined,
  logger: Logger,
) => Promise<unknown>;

export type AuthorizeFn<TClaims> = (
  ctx: RequestContext,
  claims: TClaims | undefined,
  logger: Logger,
) => boolean | Promise<boolean>;

export type TransformFn = (request: { body: unknown; headers: Record<string, string> }) => {
  body: unknown;
  headers: Record<string, string>;
};

export type SpaConfig = {
  apiPrefix?: string;
  fallback?: string;
  name?: string;
  port?: number;
  root: string;
};

export type ObservabilityConfig<TClaims = unknown> = {
  requestId?: boolean;
  logger?: Logger;
  onRequest?: (
    ctx: RequestContext,
    claims: TClaims | undefined,
    logger: Logger,
  ) => void | Promise<void>;
  onResponse?: (
    ctx: RequestContext,
    claims: TClaims | undefined,
    response: ResponseContext,
    logger: Logger,
  ) => void | Promise<void>;
};

export type OpenApiOptions = {
  title?: string;
  version?: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
};

export type CorsConfig = {
  allowedHeaders?: string[];
  credentials?: boolean;
  exposedHeaders?: string[];
  maxAge?: number;
  methods?: Array<'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'>;
  origin?: string | string[];
};

export type SecurityAuthConfig = {
  audience?: string;
  jwksUri?: string;
  strategy?: 'bearer' | 'jwks';
  secret?: () => string | Promise<string>;
  secretTtl?: number;
};

export type SecurityConfig = {
  auth?: SecurityAuthConfig;
  cors?: CorsConfig;
  csp?: CspOptions;
  rateLimit?: { maxRequests?: number; windowMs?: number };
};

export type OpenApiConfig = {
  enabled?: boolean;
  path?: string;
  options?: OpenApiOptions;
};

export type ServerConfig<TClaims = unknown> = {
  observability?: ObservabilityConfig<TClaims>;
  apiRoutes?: ApiRoute<TClaims, unknown>[];
  proxyRoutes?: ProxyRoute<TClaims>[];
  security?: SecurityConfig;
  spa: SpaConfig;
  openapi?: OpenApiConfig;
};

export type ApiRoute<TClaims = unknown, TBody = unknown> = {
  access: 'public' | 'private';
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
  observe?: boolean;
  path: string;
  type: 'api';
  authorize?: AuthorizeFn<TClaims>;
  handler: ApiRouteHandler<TClaims, TBody>;
  validationSchema?: ZodSchema<TBody>;
  openapi?: OpenApiRouteMeta;
};

export type ProxyRoute<TClaims = unknown> = {
  access: 'public' | 'private';
  methods: Array<'get' | 'post' | 'put' | 'patch' | 'delete'>;
  observe?: boolean;
  path: string;
  proxyPath?: string;
  target: string;
  timeout?: number;
  type: 'proxy';
  authorize?: AuthorizeFn<TClaims>;
  identity?: (ctx: RequestContext, claims: TClaims) => Record<string, string> | undefined;
  transform?: TransformFn;
  openapi?: OpenApiRouteMeta;
};

export type Route<TClaims = unknown, TBody = unknown> =
  | ApiRoute<TClaims, TBody>
  | ProxyRoute<TClaims>;

export type ApiRouteInput<TClaims, TBody = unknown> = Omit<
  ApiRoute<TClaims, TBody>,
  'type' | 'authorize' | 'handler'
> & {
  handler: ApiRouteHandler<TClaims, TBody>;
  authorize?: AuthorizeFn<TClaims>;
};

export type ProxyRouteInput<TClaims> = Omit<ProxyRoute<TClaims>, 'type'>;
