/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fc from 'fast-check';
import type { AnyCtxMap, AnyObjectSchema, AnyScalarSchema, HandlerMap, RouterContract } from '@arbor/router';
import { createServer } from '@arbor/router/server';
import type z from 'zod';
import { zodObjectParamsArb, zodToArbitrary } from './arbitraries.js';

// Duck-typed view of HttpContextData fields we need.
interface RouteMeta {
  bodySchema?: z.ZodType;
  querySchema?: z.ZodObject<any, any>;
  responseSchemas?: Record<number, z.ZodType>;
}

// Minimal node shape accessible from RouterContract.children.
interface WalkableNode {
  schema: AnyObjectSchema | null;
  path: string;
  children: WalkableNode[];
  _meta?: Record<string, unknown>;
}

function getTagFromSchema(schema: AnyObjectSchema): string | undefined {
  const field = schema.fields['tag'];
  return field?.kind === 'literal' ? String(field.value) : undefined;
}

function nativeScalarArb(schema: AnyScalarSchema): fc.Arbitrary<unknown> {
  switch (schema.kind) {
    case 'string': return fc.string();
    case 'number': return fc.float();
    case 'integer': return fc.integer();
    case 'boolean': return fc.boolean();
    case 'literal': return fc.constant(schema.value);
    case 'optional': return fc.option(nativeScalarArb(schema.inner), { nil: undefined });
    case 'brand': return nativeScalarArb(schema.inner);
  }
}

function nativeObjectParamsArb(
  schema: AnyObjectSchema,
  excludeKeys: string[],
): fc.Arbitrary<Record<string, unknown>> {
  const record: Record<string, fc.Arbitrary<unknown>> = {};
  for (const [k, v] of Object.entries(schema.fields)) {
    if (!excludeKeys.includes(k)) record[k] = nativeScalarArb(v);
  }
  return Object.keys(record).length > 0
    ? fc.record(record, { withDeletedKeys: false })
    : fc.constant({});
}

// Narrowed callback signature: method and schema are guaranteed to be present.
interface HttpRouteVisit {
  schema: AnyObjectSchema;
  tag: string;
  method: string;
  meta: RouteMeta;
}

function walkHttpRoutes(
  nodes: WalkableNode[],
  cb: (visit: HttpRouteVisit) => void,
): void {
  for (const node of nodes) {
    if (node.schema !== null) {
      // TypeScript narrows node.schema to ZodObject after the null check.
      const schema = node.schema;
      const tag = getTagFromSchema(schema);
      const rawMeta = node._meta ?? {};
      const method = rawMeta['method'];
      if (tag && typeof method === 'string') {
        cb({ schema, tag, method, meta: rawMeta });
      }
    }
    if (node.children.length > 0) {
      walkHttpRoutes(node.children, cb);
    }
  }
}

export interface RouteTestOptions {
  /** Number of fast-check runs per valid-input property. Default: 100. */
  runs?: number;
  /** Number of fast-check runs for the malformed-body property. Default: 50. */
  malformedRuns?: number;
}

/**
 * Generates a framework-agnostic test suite for every HTTP route in `router`.
 *
 * Returns `Record<testName, async () => void>`. Callers register the entries
 * into their test runner:
 *
 * ```ts
 * for (const [name, fn] of Object.entries(createRouteTests(router, handlers))) {
 *   it(name, fn);
 * }
 * ```
 *
 * Each route gets two test functions:
 * 1. `"<tag> — valid inputs"` — fast-check property: N random valid inputs →
 *    response status must be one of the declared codes; body must parse against
 *    the matching response schema.
 * 2. `"<tag> — rejects malformed body"` — only if the route has a body schema;
 *    random non-object values → response must be 400.
 */
export function createRouteTests<
  Route extends { tag: string },
  Map extends AnyCtxMap,
>(
  router: RouterContract<Route, Map>,
  handlers: HandlerMap<Map, Route>,
  options?: RouteTestOptions,
): Record<string, () => Promise<void>> {
  const server = createServer(router, handlers);
  const nodes = router.children as unknown as WalkableNode[];
  const runs = options?.runs ?? 100;
  const malformedRuns = options?.malformedRuns ?? 50;

  const tests: Record<string, () => Promise<void>> = {};

  walkHttpRoutes(nodes, ({ schema, tag, method, meta }) => {
    const { bodySchema, querySchema, responseSchemas } = meta;
    const declaredStatuses = new Set(
      Object.keys(responseSchemas ?? {}).map(Number),
    );

    // Build arbitrary for the route object { tag, ...params, query? }
    const paramArb = nativeObjectParamsArb(schema, ['tag', 'query']);
    const queryArb: fc.Arbitrary<Record<string, unknown> | undefined> = querySchema
      ? zodObjectParamsArb(querySchema, [])
      : fc.constant(undefined);

    const routeArb = fc
      .tuple(paramArb, queryArb)
      .map(([params, query]) => ({
        tag,
        ...params,
        ...(query !== undefined ? { query } : {}),
      }));

    const bodyArb: fc.Arbitrary<unknown> = bodySchema
      ? zodToArbitrary(bodySchema)
      : fc.constant(undefined);

    // 1. Valid-input property
    tests[`${tag} — valid inputs`] = async () => {
      await fc.assert(
        fc.asyncProperty(routeArb, bodyArb, async (routeObj, body) => {
          const path = router.print(routeObj as Route);
          const url = new URL(path, 'http://localhost');
          const result = await server.handle(url, method, body, {});

          if (declaredStatuses.size > 0 && !declaredStatuses.has(result.status)) {
            throw new Error(
              `Route "${tag}": handler returned undeclared status ${String(result.status)}. ` +
                `Declared: [${[...declaredStatuses].join(', ')}].`,
            );
          }

          const responseSchema = responseSchemas?.[result.status];
          if (responseSchema) {
            const parsed = responseSchema.safeParse(result.body);
            if (!parsed.success) {
              throw new Error(
                `Route "${tag}": response body for status ${String(result.status)} failed schema validation. ` +
                  `Issues: ${JSON.stringify(parsed.error.issues)}`,
              );
            }
          }
        }),
        { numRuns: runs },
      );
    };

    // 2. Malformed-body property (only when the route has a body schema)
    if (bodySchema) {
      // Primitives that are never valid as an object body.
      const badBodyArb = fc.oneof(
        fc.constant(null),
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant([]),
      );

      tests[`${tag} — rejects malformed body`] = async () => {
        // Generate one valid route object to produce a stable URL.
        const [routeObj] = fc.sample(routeArb, 1);

        await fc.assert(
          fc.asyncProperty(badBodyArb, async (badBody) => {
            const path = router.print(routeObj as Route);
            const url = new URL(path, 'http://localhost');
            const result = await server.handle(url, method, badBody, {});
            if (result.status !== 400) {
              throw new Error(
                `Route "${tag}": expected 400 for invalid body, got ${String(result.status)}.`,
              );
            }
          }),
          { numRuns: malformedRuns },
        );
      };
    }
  });

  return tests;
}
