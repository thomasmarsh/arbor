export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
> = {
  method: Method;
  body: Body;
  response: Response;
};
