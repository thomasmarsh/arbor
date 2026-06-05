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
export {
  boolean,
  email,
  integer,
  literal,
  number,
  object,
  optional,
  string,
  url,
  uuid,
  type AnyObjectSchema,
  type AnyScalarSchema,
  type Infer,
  type SchemaIssue,
} from './core/schema.js';

// HTTP
export { createClient, type FetchLike, type TypedClient } from './client/fetch-client.js';
export { matchResponse, type MatchHandlers } from './client/match-response.js';
export { createTestClient } from './client/test-client.js';
export {
  desc,
  httpRoute,
  respond,
  type HttpContext,
  type HttpContextData,
  type HttpMethod,
  type HttpResponse,
  type HttpResponseSelect,
  type HttpSession,
  type InferHttpSession,
  type InferSingleSuccessBody,
} from './contexts/http-context.js';
export { type AnyCtxMap, type RouterContract } from './core/router-contract.js';
export { composeGuards, pipeline, withGuard, type Guard } from './server/guard.js';
export {
  createMemoryStore,
  withRateLimit,
  type RateLimitPolicy,
  type RateLimitStore,
} from './server/rate-limit.js';
export {
  createServer,
  type ErrorMapEntry,
  type HandlerCtx,
  type HandlerMap,
  type RateLimitKeyResolver,
} from './server/server.js';
export { withApiKey, type ApiKeyOptions } from './server/with-api-key.js';
export { withCors, type CorsConfig } from './server/with-cors.js';
export { withMetrics, type MetricsEmitter, type RequestMetric } from './server/with-metrics.js';
export { withRbac } from './server/with-rbac.js';
export { withSession } from './server/with-session.js';

// OpenAPI
export {
  openApiRoute,
  type OpenApiContext,
  type OpenApiMeta,
} from './contexts/openapi/openapi-context.js';
export { generateSpec } from './openapi/index.js';

// Session types
export { sessionRoute } from './core/session-route.js';
export {
  type Branch,
  type Channel,
  type Dual,
  type End,
  type InferDual,
  type InferSession,
  type Recv,
  type Select,
  type Send,
  type Session,
  type SessionMeta,
} from './core/session.js';
export { IxSession, done, type ChoiceResult, type Done } from './core/ix-session.js';
export {
  buildIxSessionOps,
  type IxSessionOps,
  type SessionAdapter,
} from './core/ix-session-ops.js';

// SSE
export { createSseClient, type SseClient, type SseFetchLike } from './client/sse-client.js';
export { sseRoute, type SseContext, type SseMeta } from './contexts/realtime/sse-context.js';
export {
  createSseServer,
  type SseHandlerCtx,
  type SseHandlerMap,
  type SseRouterContract,
} from './server/sse-dispatch.js';

// WebSocket
export { createWsClient, type WsClient, type WsConnectFn } from './client/ws-client.js';
export {
  createWsAdapterPair,
  collectWsSessionMetaMap,
  getWsSessionMeta,
  wsRoute,
  wsSessionRoute,
  type WsAdapter,
  type WsChannel,
  type WsContext,
  type WsMeta,
  type WsSessionContext,
  type WsSessionMeta,
  type WsSessionWalkNode,
  type WsWalkNode,
} from './contexts/realtime/ws-context.js';
export {
  createWsServer,
  createWsSessionServer,
  type WsHandlerCtx,
  type WsHandlerMap,
  type WsRouterContract,
  type WsSessionHandlerCtx,
  type WsSessionHandlerMap,
  type WsSessionRouterContract,
} from './server/ws-dispatch.js';
