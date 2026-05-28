# PLAN.05 — Add barrel `index.ts`

## Problem

There is no `src/index.ts`. A consumer must know to import from
`define-routes.js`, `http-context.js`, `server.js`, `client.js`, and
`openapi-context.js` individually. The re-exports in `define-routes.ts`
cover core types but not the HTTP/server/client/OpenAPI layer.

## Change

1. Create `src/index.ts` that re-exports the public API:

   ```typescript
   // Core
   export {
     defineRoutes, route, section,
     type RouteNode, type InferRoute, type InferContext,
     type ChildUnion, type CtxMap, type Derive, type Flatten,
   } from './define-routes.js';
   export { type Segment, parseSegments, matchSegments } from './segments.js';
   export { walkParse, walkPrint, buildUrl } from './walk.js';

   // HTTP
   export { httpRoute, type HttpContext, type HttpMethod } from './http-context.js';
   export { createServer, type HandlerMap } from './server.js';
   export { createClient, type FetchLike } from './client.js';

   // OpenAPI
   export {
     openApiRoute, generateSpec,
     type OpenApiContext, type OpenApiMeta,
   } from './openapi-context.js';
   ```

2. Add `"exports"` field to `package.json` pointing at `src/index.ts`
   (or the compiled output path if/when a build step is added).

3. Run `npm test && npm run typecheck`.

## Notes

- Decide whether `walkParse`/`walkPrint`/`buildUrl`/`matchSegments` are truly
  public API or internal. If internal, omit them from the barrel.
- The re-exports currently in `define-routes.ts` can stay for now (they don't
  conflict), or be removed in favour of the barrel.

## Risk

Near zero. Additive change.
