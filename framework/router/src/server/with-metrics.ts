export interface RequestMetric {
  tag: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: number;
}

export type MetricsEmitter = (metric: RequestMetric) => void;

interface ServerLike {
  handle(url: URL, method: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: unknown; tag: string }>;
  handleRequest(request: Request): Promise<{ status: number; body: unknown; tag: string }>;
}

export function withMetrics<S extends ServerLike>(server: S, emitter: MetricsEmitter): S {
  return {
    ...server,
    async handle(url: URL, method: string, body?: unknown, headers?: Record<string, string>) {
      const start = Date.now();
      const result = await server.handle(url, method, body, headers);
      emitter({ tag: result.tag, method, status: result.status, durationMs: Date.now() - start, timestamp: start });
      return result;
    },
    async handleRequest(request: Request) {
      const start = Date.now();
      const result = await server.handleRequest(request);
      emitter({ tag: result.tag, method: request.method, status: result.status, durationMs: Date.now() - start, timestamp: start });
      return result;
    },
  };
}
