// .use() fluent builder + pipeline(): left-to-right route-node composition.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-member-access */
import z from 'zod';
import { type RouteNode, httpRoute, literal, object, pipeline, string } from '../src/index.js';

// Route-node transformers — functions from RouteNode to RouteNode applied at definition time.

function withDeprecated<N extends RouteNode<any, any, any, any, any>>(node: N): N & { _deprecated: true } {
  return Object.assign(node, { _deprecated: true as const });
}

function withInternal<N extends RouteNode<any, any, any, any, any>>(node: N): N & { _internal: true } {
  return Object.assign(node, { _internal: true as const });
}

const GetUser = object({ tag: literal('get-user'), id: string() });

// Fluent: apply transformers left-to-right with .use()
const route1 = httpRoute(GetUser, 'GET', 'users/:id', {
  response: { 200: z.object({ id: z.string() }) },
})
  .use(withDeprecated)
  .use(withInternal);

console.log('route1._deprecated:', route1._deprecated); // true
console.log('route1._internal:', route1._internal);     // true
console.log('route1.path:', route1.path);               // users/:id

// pipeline(): compose multiple transforms into one combinator for reuse
const adminPipeline = pipeline(withDeprecated, withInternal);

const GetAdmin = object({ tag: literal('get-admin') });
const route2 = httpRoute(GetAdmin, 'GET', 'admin', {
  response: { 200: z.object({ ok: z.boolean() }) },
}).pipe(adminPipeline);

console.log('route2._deprecated:', (route2 as any)._deprecated); // true
console.log('route2._internal:', (route2 as any)._internal);     // true
console.log('route2.path:', route2.path);                        // admin

// The underlying RouteNode shape is unchanged — createServer sees no difference.
console.log('method:', (route1._meta as any).method);  // GET
