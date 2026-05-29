export interface CorsConfig {
  origins: string[] | '*';
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  csrf?: boolean;
}

interface ServerLike {
  handle(
    url: URL,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: unknown; headers?: Record<string, string>; tag: string }>;
  handleRequest(
    request: Request,
  ): Promise<{ status: number; body: unknown; headers?: Record<string, string>; tag: string }>;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isOriginAllowed(origin: string | undefined, origins: string[] | '*'): boolean {
  if (origins === '*') return true;
  if (!origin) return false;
  return origins.includes(origin);
}

function corsHeaders(origin: string | undefined, config: CorsConfig): Record<string, string> {
  if (!isOriginAllowed(origin, config.origins)) return {};
  const acao = config.origins === '*' ? '*' : (origin ?? '');
  const headers: Record<string, string> = { 'access-control-allow-origin': acao };
  if (config.credentials) headers['access-control-allow-credentials'] = 'true';
  return headers;
}

function preflightHeaders(origin: string | undefined, config: CorsConfig): Record<string, string> {
  const headers = corsHeaders(origin, config);
  if (config.methods) headers['access-control-allow-methods'] = config.methods.join(', ');
  if (config.allowedHeaders) headers['access-control-allow-headers'] = config.allowedHeaders.join(', ');
  if (config.maxAge !== undefined) headers['access-control-max-age'] = String(config.maxAge);
  return headers;
}

function parseCookieToken(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return undefined;
}

function csrfValid(method: string, headers: Record<string, string>, config: CorsConfig): boolean {
  if (!config.csrf || !MUTATING_METHODS.has(method.toUpperCase())) return true;
  const fromHeader = headers['x-csrf-token'];
  const fromCookie = parseCookieToken(headers['cookie'], 'csrf-token');
  return !!fromHeader && fromHeader === fromCookie;
}

export function withCors<S extends ServerLike>(server: S, config: CorsConfig): S {
  return {
    ...server,
    async handle(url: URL, method: string, body?: unknown, headers?: Record<string, string>) {
      const h = headers ?? {};
      const origin = h['origin'];

      if (method.toUpperCase() === 'OPTIONS') {
        return { status: 204, body: null, headers: preflightHeaders(origin, config), tag: 'preflight' };
      }

      if (!csrfValid(method, h, config)) {
        return { status: 403, body: { error: 'invalid csrf token' }, tag: 'csrf-rejected' };
      }

      const result = await server.handle(url, method, body, headers);
      return { ...result, headers: { ...result.headers, ...corsHeaders(origin, config) } };
    },
    async handleRequest(request: Request) {
      const origin = request.headers.get('origin') ?? undefined;

      if (request.method.toUpperCase() === 'OPTIONS') {
        return { status: 204, body: null, headers: preflightHeaders(origin, config), tag: 'preflight' };
      }

      const h: Record<string, string> = {};
      request.headers.forEach((v, k) => { h[k] = v; });

      if (!csrfValid(request.method, h, config)) {
        return { status: 403, body: { error: 'invalid csrf token' }, tag: 'csrf-rejected' };
      }

      const result = await server.handleRequest(request);
      return { ...result, headers: { ...result.headers, ...corsHeaders(origin, config) } };
    },
  };
}
