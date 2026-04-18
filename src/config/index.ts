import { type RequestContext, type ServerConfig, apiRoute, proxyRoute } from './types';

interface UserClaims {
  sub: string;
  role: string;
}

const exampleModularRoute = apiRoute<UserClaims>({
  path: '/profile',
  access: 'private',
  method: 'get',
  authorize: (_ctx, claims) => !!claims?.role && claims.role === 'admin',
  handler: async (ctx, claims) => ({
    ctx: JSON.stringify(ctx),
    user: claims?.sub,
  }),
});

// this is only used for development purposes and will be removed when I am satisfied with the api design
const exampleServerConfig: ServerConfig<UserClaims> = {
  spa: {
    name: 'my-app',
    root: '/var/www',
    fallback: 'index.html',
  },
  routes: [
    exampleModularRoute,
    apiRoute<UserClaims>({
      path: '/health',
      access: 'public',
      method: 'get',
      handler: async () => ({ status: 'ok' }),
    }),
    proxyRoute<UserClaims>({
      // url translation: /api/users?foo=bar → https://api.example.com/users?foo=bar
      path: '/api/users',
      access: 'private',
      methods: ['get', 'post'],
      target: 'https://api.example.com',
      proxyPath: '/users',
      retries: {
        attempts: 3,
        backoff: 'exponential',
      },
      timeout: 5000,
      transform: ({ body, headers }) => ({
        body: {
          ...(typeof body === 'object' && body ? body : {}),
          transformed: true,
        },
        headers,
      }),
    }),
    proxyRoute<UserClaims>({
      // url translation: /api/orders → https://api.example.com/api/orders (proxyPath defaults to matched path)
      path: '/api/orders',
      access: 'private',
      methods: ['get'],
      target: 'https://api.example.com',
      authorize: (ctx: RequestContext, claims: UserClaims | undefined) =>
        !!claims?.role && (claims.role === 'admin' || claims.role === 'user'),
    }),
  ],

  observability: {
    onRequest: (ctx, claims) => {
      console.log(`[Request] ${ctx.method} ${ctx.path} (user: ${claims?.sub ?? 'anonymous'})`);
    },
    onResponse: (ctx, claims, { statusCode, durationMs }) => {
      console.log(
        `[Response] ${ctx.method} ${ctx.path} ${statusCode} ${durationMs}ms (user: ${claims?.sub ?? 'anonymous'})`
      );
    },
  },
  security: {
    cors: {
      origin: ['http://localhost:4200'],
      methods: ['get', 'post', 'put', 'delete', 'patch'],
      credentials: true,
    },
    csp: {
      'default-src': ["'self'"],
    },
    auth: {
      strategy: 'bearer',
      secret: () => process.env.JWT_SECRET ?? '',
    },
    rateLimit: {
      windowMs: 900000,
      maxRequests: 100,
    },
  },
};
