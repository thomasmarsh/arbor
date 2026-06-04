import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { defineRoutes, httpRoute, literal, object, respond, string } from '@arbor/router';
import { zodToArbitrary } from './arbitraries.js';
import { createRouteTests } from './create-route-tests.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

const GetUser = object({ tag: literal('get-user'), id: string() });
const UserBody = z.object({ id: z.string(), name: z.string() });
const ErrorBody = z.object({ error: z.string() });

const CreateItem = object({ tag: literal('create-item') });
const ItemBody = z.object({ name: z.string() });
const CreatedBody = z.object({ id: z.string() });

const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserBody, 404: ErrorBody },
  }),
  httpRoute(CreateItem, 'POST', 'items', {
    body: ItemBody,
    response: { 201: CreatedBody },
  }),
]);

// ─── helpers ─────────────────────────────────────────────────────────────────

async function runSuite(suite: Record<string, () => Promise<void>>): Promise<void> {
  for (const fn of Object.values(suite)) {
    await fn();
  }
}

function getTest(suite: Record<string, () => Promise<void>>, name: string): () => Promise<void> {
  const fn = suite[name];
  if (!fn) throw new Error(`test suite missing entry: ${name}`);
  return fn;
}

// ─── spike: confirm Zod v4 → fast-check generation ───────────────────────────

describe('zodToArbitrary — spike confirmation', () => {
  const schemas: [string, z.ZodType][] = [
    ['string', z.string()],
    ['number', z.number()],
    ['boolean', z.boolean()],
    ['literal', z.literal('hello')],
    ['enum', z.enum(['a', 'b', 'c'])],
    ['object', z.object({ x: z.string(), y: z.number() })],
    ['array', z.array(z.string())],
    ['union', z.union([z.string(), z.number()])],
    ['optional string', z.string().optional()],
    ['nullable string', z.string().nullable()],
    ['nested object', z.object({ tag: z.literal('test'), id: z.string(), n: z.number().optional() })],
  ];

  it.each(schemas)('generates samples for %s', (_, schema) => {
    const arb = zodToArbitrary(schema);
    const samples = fc.sample(arb, 10);
    for (const sample of samples) {
      expect(schema.safeParse(sample).success).toBe(true);
    }
  });
});

// ─── createRouteTests ────────────────────────────────────────────────────────

describe('createRouteTests', () => {
  it('returns a test name for each route', () => {
    const suite = createRouteTests(router, {
      'get-user': () => Promise.resolve(respond(200, { id: '1', name: 'Alice' })),
      'create-item': (ctx) => Promise.resolve(respond(201, { id: ctx.body.name })),
    });
    const names = Object.keys(suite);
    expect(names).toContain('get-user — valid inputs');
    expect(names).toContain('create-item — valid inputs');
    // POST with body schema → malformed test included
    expect(names).toContain('create-item — rejects malformed body');
    // GET with no body schema → no malformed test
    expect(names).not.toContain('get-user — rejects malformed body');
  });

  it('passes for correct handlers', async () => {
    const suite = createRouteTests(
      router,
      {
        'get-user': (ctx) =>
          ctx.params.id === 'notfound'
            ? Promise.resolve(respond(404, { error: 'not found' }))
            : Promise.resolve(respond(200, { id: ctx.params.id, name: 'Alice' })),
        'create-item': (ctx) => Promise.resolve(respond(201, { id: ctx.body.name })),
      },
      { runs: 20, malformedRuns: 10 },
    );
    await expect(runSuite(suite)).resolves.toBeUndefined();
  });

  it('catches a handler that returns an undeclared status code', async () => {
    const suite = createRouteTests(
      router,
      {
        // 500 as 200 satisfies the declared type but is 500 at runtime → caught by property test
        'get-user': () =>
          Promise.resolve({ status: 500 as unknown as 200, body: { id: '', name: '' } }),
        'create-item': () => Promise.resolve(respond(201, { id: 'test' })),
      },
      { runs: 10, malformedRuns: 5 },
    );
    await expect(getTest(suite, 'get-user — valid inputs')()).rejects.toThrow('undeclared status');
  });

  it('catches a handler that returns a body that does not match the response schema', async () => {
    const suite = createRouteTests(
      router,
      {
        // correct status code but wrong body shape at runtime
        'get-user': () =>
          Promise.resolve({
            status: 200 as const,
            body: { wrong: 'field' } as unknown as { id: string; name: string },
          }),
        'create-item': () => Promise.resolve(respond(201, { id: 'test' })),
      },
      { runs: 10, malformedRuns: 5 },
    );
    await expect(getTest(suite, 'get-user — valid inputs')()).rejects.toThrow();
  });

  it('malformed-body test expects 400 for invalid inputs', async () => {
    const suite = createRouteTests(
      router,
      {
        'get-user': () => Promise.resolve(respond(200, { id: '1', name: 'Alice' })),
        'create-item': (ctx) => Promise.resolve(respond(201, { id: ctx.body.name })),
      },
      { malformedRuns: 10 },
    );
    await expect(getTest(suite, 'create-item — rejects malformed body')()).resolves.toBeUndefined();
  });
});
