export interface RequestContext {
  path: string;
  method: string;
  user?: {
    token: string;
  };
}

export type RequestHandler = (ctx: RequestContext) => Promise<Response> | Response;
