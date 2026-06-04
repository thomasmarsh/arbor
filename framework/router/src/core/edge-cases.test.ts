import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineRoutes, route, section, type InferRoute } from './define-routes.js';
import { integer, literal, object, optional, string } from './schema.js';
import { routeFixtures } from '../test-utils/fixtures.js';

describe('Empty and degenerate trees', () => {
  it('empty router: parse fails for root path', () => {
    const emptyRouter = defineRoutes([]);
    expect(emptyRouter.parse(new URL('https://example.com/')).isErr()).toBe(true);
  });

  it('empty router: parse fails for any non-root path', () => {
    const emptyRouter = defineRoutes([]);
    expect(emptyRouter.parse(new URL('https://example.com/anything')).isErr()).toBe(true);
  });

  it('empty router: print returns "/"', () => {
    const emptyRouter = defineRoutes([]);
    // @ts-expect-error — no valid routes exist; never parameter is intentionally violated
    expect(emptyRouter.print({})).toBe('/');
  });

  it('single leaf route: parse succeeds', () => {
    const Home = object({ tag: literal('home') });
    const router = defineRoutes([route(Home, 'home/')]);
    expect(router.parse(new URL('https://example.com/home')).getOrThrow()).toEqual({ tag: 'home' });
  });

  it('single leaf route: print and parse roundtrip', () => {
    const Home = object({ tag: literal('home') });
    const router = defineRoutes([route(Home, 'home/')]);
    const printed = router.print({ tag: 'home' });
    expect(printed).toBe('/home');
    expect(router.parse(new URL(`https://example.com${printed}`)).getOrThrow()).toEqual({
      tag: 'home',
    });
  });

  it('tag-only schema: parse result contains only the tag field', () => {
    const Ping = object({ tag: literal('ping') });
    const router = defineRoutes([route(Ping, 'ping/')]);
    const result = router.parse(new URL('https://example.com/ping')).getOrThrow();
    expect(result).toEqual({ tag: 'ping' });
    expect(Object.keys(result)).toEqual(['tag']);
  });

  it('tag-only schema: print produces correct URL', () => {
    const Ping = object({ tag: literal('ping') });
    const router = defineRoutes([route(Ping, 'ping/')]);
    expect(router.print({ tag: 'ping' })).toBe('/ping');
  });

  it('parse fails when URL has extra segments beyond a leaf route', () => {
    const Home = object({ tag: literal('home') });
    const router = defineRoutes([route(Home, 'home/')]);
    expect(router.parse(new URL('https://example.com/home/extra')).isErr()).toBe(true);
  });
});

describe('Path segment edge cases', () => {
  it('trailing slash in URL matches route defined with trailing slash', () => {
    const A = object({ tag: literal('a') });
    const router = defineRoutes([route(A, 'a/')]);
    expect(router.parse(new URL('https://example.com/a/')).isOk()).toBe(true);
  });

  it('no trailing slash in URL matches route defined with trailing slash', () => {
    const A = object({ tag: literal('a') });
    const router = defineRoutes([route(A, 'a/')]);
    expect(router.parse(new URL('https://example.com/a')).isOk()).toBe(true);
  });

  it('consecutive path params: both segments captured', () => {
    const Pair = object({ tag: literal('pair'), x: string(), y: string() });
    const router = defineRoutes([route(Pair, ':x/:y/')]);
    const result = router.parse(new URL('https://example.com/hello/world')).getOrThrow();
    expect(result).toEqual({ tag: 'pair', x: 'hello', y: 'world' });
  });

  it('consecutive path params: print produces correct URL', () => {
    const Pair = object({ tag: literal('pair'), x: string(), y: string() });
    const router = defineRoutes([route(Pair, ':x/:y/')]);
    expect(router.print({ tag: 'pair', x: 'foo', y: 'bar' })).toBe('/foo/bar');
  });

  it('wildcard at root captures all URL segments as a string', () => {
    const Wild = object({ tag: literal('wildcard'), rest: string() });
    const router = defineRoutes([route(Wild, '*rest/')]);
    const result = router.parse(new URL('https://example.com/a/b/c')).getOrThrow();
    expect(result).toMatchObject({ tag: 'wildcard', rest: 'a/b/c' });
  });

  it('wildcard at root captures empty string for root URL', () => {
    const Wild = object({ tag: literal('wildcard'), rest: string() });
    const router = defineRoutes([route(Wild, '*rest/')]);
    const result = router.parse(new URL('https://example.com/')).getOrThrow();
    expect(result).toMatchObject({ tag: 'wildcard', rest: '' });
  });

  it('wildcard in nested position captures remaining segments as a string', () => {
    const Files = object({ tag: literal('files') });
    const File = object({ tag: literal('file'), path: string() });
    const router = defineRoutes([route(Files, 'files/', [route(File, '*path/')])]);
    const result = router.parse(new URL('https://example.com/files/a/b/c')).getOrThrow();
    expect(result).toMatchObject({ tag: 'files', child: { tag: 'file', path: 'a/b/c' } });
  });

  it('param name collision: child segment overwrites parent segment value', () => {
    const Parent = object({ tag: literal('parent'), id: string() });
    const Child = object({ tag: literal('child'), id: string() });
    const router = defineRoutes([route(Parent, ':id/', [route(Child, ':id/')])]);
    const result = router.parse(new URL('https://example.com/parent-val/child-val')).getOrThrow();
    expect(result).toMatchObject({
      tag: 'parent',
      id: 'parent-val',
      child: { tag: 'child', id: 'child-val' },
    });
  });
});

describe('Schema edge cases', () => {
  it('tag-only schema (no other fields): parse result is exactly the tag', () => {
    const Empty = object({ tag: literal('empty') });
    const router = defineRoutes([route(Empty, 'empty/')]);
    expect(router.parse(new URL('https://example.com/empty')).getOrThrow()).toEqual({
      tag: 'empty',
    });
  });

  it('optional query field absent: field omitted from parse result', () => {
    const Search = object({ tag: literal('search'), q: optional(string()) });
    const router = defineRoutes([route(Search, 'search/')]);
    const result = router.parse(new URL('https://example.com/search')).getOrThrow();
    expect(result).toEqual({ tag: 'search' });
    expect((result as { q?: string }).q).toBeUndefined();
  });

  it('optional query field present: field captured from query string', () => {
    const Search = object({ tag: literal('search'), q: optional(string()) });
    const router = defineRoutes([route(Search, 'search/')]);
    const result = router.parse(new URL('https://example.com/search?q=hello')).getOrThrow();
    expect(result).toMatchObject({ tag: 'search', q: 'hello' });
  });

  it('field with default absent: field absent in native schema (no defaults)', () => {
    const Page = object({ tag: literal('page'), n: optional(string()) });
    const router = defineRoutes([route(Page, 'page/')]);
    const result = router.parse(new URL('https://example.com/page')).getOrThrow();
    expect(result).toEqual({ tag: 'page' });
  });

  it('field with query value: value preserved as string in native schema', () => {
    const Page = object({ tag: literal('page'), n: optional(string()) });
    const router = defineRoutes([route(Page, 'page/')]);
    expect(router.parse(new URL('https://example.com/page?n=5')).getOrThrow()).toMatchObject({
      n: '5',
    });
  });

  it('optional path param absent: field omitted from result', () => {
    const Detail = object({ tag: literal('detail'), id: optional(string()) });
    const router = defineRoutes([route(Detail, 'detail/:id?/')]);
    expect(router.parse(new URL('https://example.com/detail')).getOrThrow()).toEqual({
      tag: 'detail',
    });
  });

  it('optional path param present: field captured', () => {
    const Detail = object({ tag: literal('detail'), id: optional(string()) });
    const router = defineRoutes([route(Detail, 'detail/:id?/')]);
    expect(router.parse(new URL('https://example.com/detail/42')).getOrThrow()).toMatchObject({
      id: '42',
    });
  });
});

describe('Composition', () => {
  it('composed empty + non-empty: parses routes from non-empty sub-router', () => {
    const A = object({ tag: literal('a') });
    const aRouter = defineRoutes([route(A, 'a/')]);
    const emptyRouter = defineRoutes([]);
    const composed = defineRoutes([...aRouter.children, ...emptyRouter.children]);
    expect(composed.parse(new URL('https://example.com/a')).getOrThrow()).toEqual({ tag: 'a' });
  });

  it('composed empty + non-empty: unmatched path still fails', () => {
    const A = object({ tag: literal('a') });
    const aRouter = defineRoutes([route(A, 'a/')]);
    const emptyRouter = defineRoutes([]);
    const composed = defineRoutes([...aRouter.children, ...emptyRouter.children]);
    expect(composed.parse(new URL('https://example.com/b')).isErr()).toBe(true);
  });

  it('two routers with same path prefix: first registered route wins', () => {
    const A = object({ tag: literal('a-v1') });
    const B = object({ tag: literal('a-v2') });
    const r1 = defineRoutes([route(A, 'api/')]);
    const r2 = defineRoutes([route(B, 'api/')]);
    const composed = defineRoutes([...r1.children, ...r2.children]);
    expect(composed.parse(new URL('https://example.com/api')).getOrThrow()).toMatchObject({
      tag: 'a-v1',
    });
  });

  it('duplicate tag in different branches: throws at construction', () => {
    const A = object({ tag: literal('dup') });
    const B = object({ tag: literal('dup') });
    const r1 = defineRoutes([route(A, 'a/')]);
    const r2 = defineRoutes([route(B, 'b/')]);
    expect(() => defineRoutes([...r1.children, ...r2.children])).toThrow(
      'duplicate route tag: "dup"',
    );
  });

  it('composed section and flat route: both paths resolve correctly', () => {
    const A = object({ tag: literal('a') });
    const B = object({ tag: literal('b') });
    const sectionRouter = defineRoutes([section('v1/', [route(A, 'a/')])]);
    const bRouter = defineRoutes([route(B, 'b/')]);
    const composed = defineRoutes([...sectionRouter.children, ...bRouter.children]);
    expect(composed.parse(new URL('https://example.com/v1/a')).getOrThrow()).toMatchObject({
      child: { tag: 'a' },
    });
    expect(composed.parse(new URL('https://example.com/b')).getOrThrow()).toEqual({ tag: 'b' });
  });
});

describe('Type-level only', () => {
  it('InferRoute of empty router is never', () => {
    const _emptyRouter = defineRoutes([]);
    expectTypeOf<InferRoute<typeof _emptyRouter>>().toEqualTypeOf<never>();
  });

  it('InferRoute of single-route router matches that route shape', () => {
    const Home = object({ tag: literal('home'), id: string() });
    const _router = defineRoutes([route(Home, 'home/:id/')]);
    expectTypeOf<InferRoute<typeof _router>>().toEqualTypeOf<{ tag: 'home'; id: string }>();
  });

  it('InferRoute of composed router is assignable from either sub-router type', () => {
    const A = object({ tag: literal('a') });
    const B = object({ tag: literal('b'), name: string() });
    const r1 = defineRoutes([route(A, 'a/')]);
    const r2 = defineRoutes([route(B, 'b/:name/')]);
    const _composed = defineRoutes([...r1.children, ...r2.children]);
    type Composed = InferRoute<typeof _composed>;
    expectTypeOf<{ tag: 'a' }>().toExtend<Composed>();
    expectTypeOf<{ tag: 'b'; name: string }>().toExtend<Composed>();
  });

  it('InferRoute does not include tags not declared in the router', () => {
    const A = object({ tag: literal('a') });
    const _router = defineRoutes([route(A, 'a/')]);
    type Route = InferRoute<typeof _router>;
    expectTypeOf<{ tag: 'nonexistent' }>().not.toExtend<Route>();
  });
});

describe('PBT — adversarial never-throw', () => {
  const router = routeFixtures.combinedTree();
  const knownTags = new Set(['users', 'user', 'settings', 'org', 'project', 'issue']);

  it('router.parse never throws for any valid URL', () => {
    fc.assert(fc.property(fc.webUrl(), (url) => {
      expect(() => router.parse(new URL(url))).not.toThrow();
    }), { numRuns: 500 });
  });

  it('parse result only contains known tags when it succeeds', () => {
    fc.assert(fc.property(fc.webPath(), (path) => {
      const result = router.parse(new URL('https://example.com' + path));
      if (result.isOk()) {
        let current: Record<string, unknown> | undefined = result.getOrThrow();
        while (current) {
          if (typeof current['tag'] === 'string') {
            expect(knownTags.has(current['tag'])).toBe(true);
          }
          current = current['child'] as Record<string, unknown> | undefined;
        }
      }
    }), { numRuns: 500 });
  });

  it('handles empty path segments (//)', () => {
    expect(() => router.parse(new URL('https://example.com//'))).not.toThrow();
  });

  it('handles very long paths', () => {
    const longPath = '/users/' + 'a'.repeat(1000);
    expect(() => router.parse(new URL('https://example.com' + longPath))).not.toThrow();
  });

  it('handles query strings with special characters', () => {
    expect(() => router.parse(new URL('https://example.com/users?a=%3C%3E&b=%22'))).not.toThrow();
  });

  it('handles URL with all segment kinds in path', () => {
    const Wild = object({ tag: literal('wild'), id: string(), num: integer(), rest: string() });
    const mixedRouter = defineRoutes([route(Wild, ':id/#num/*rest/')]);
    expect(() => mixedRouter.parse(new URL('https://example.com/users/42/a/b/c'))).not.toThrow();
  });
});
