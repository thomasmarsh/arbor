// Core
export {
  defineRoutes,
  route,
  section,
  type BuildableRouteNode,
  type ChildUnion,
  type CtxMap,
  type Derive,
  type Flatten,
  type InferContext,
  type InferRoute,
  type ParseDiag,
  type ResponseUnion,
  type RouteNode,
} from './core/define-routes.js';

// HTTP
export { type AnyCtxMap, type RouterContract } from './core/router-contract.js';
export { createClient, type FetchLike, type TypedClient } from './client/fetch-client.js';
export { matchResponse, type MatchHandlers } from './client/match-response.js';
export { createTestClient } from './client/test-client.js';
export { type Guard, composeGuards, pipeline, withGuard } from './server/guard.js';
export { withSession } from './server/with-session.js';
export { withRbac } from './server/with-rbac.js';
export { withApiKey, type ApiKeyOptions } from './server/with-api-key.js';
export { httpRoute, respond, desc, type HttpContext, type HttpMethod, type HttpResponse } from './contexts/http-context.js';
export { createMemoryStore, type RateLimitPolicy, type RateLimitStore, withRateLimit } from './server/rate-limit.js';
export { createServer, type ErrorMapEntry, type HandlerCtx, type HandlerMap, type RateLimitKeyResolver } from './server/server.js';
export { withMetrics, type MetricsEmitter, type RequestMetric } from './server/with-metrics.js';
export { withCors, type CorsConfig } from './server/with-cors.js';

// OpenAPI
export { openApiRoute, type OpenApiContext, type OpenApiMeta } from './contexts/openapi-context.js';
export { generateSpec } from './openapi/index.js';
