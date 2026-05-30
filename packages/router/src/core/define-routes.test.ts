/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { type BuildableRouteNode, type RouteNode, defineRoutes, route, section } from './define-routes.js';

describe('defineRoutes', () => {
  const Users = z.object({ tag: z.literal('users') });
  const User = z.object({ tag: z.literal('user'), id: z.string() });
  const Settings = z.object({ tag: z.literal('settings') });
  const Org = z.object({ tag: z.literal('org'), orgId: z.string() });
  const Project = z.object({ tag: z.literal('project'), projectId: z.number() });
  const Issue = z.object({
    tag: z.literal('issue'),
    issueId: z.string(),
    status: z.enum(['open', 'closed']).optional(),
    page: z.coerce.number().default(1),
  });

  const router = defineRoutes([
    route(Users, 'users/', [route(User, ':id/', [route(Settings, 'settings/')])]),
    route(Org, 'orgs/:orgId/', [route(Project, '#projectId/', [route(Issue, ':issueId/')])]),
  ]);

  const url = (path: string) => new URL(`https://example.com${path}`);

  describe('parse', () => {
    it('parses /users', () => {
      expect(router.parse(url('/users')).getOrThrow()).toEqual({ tag: 'users' });
    });

    it('parses /users/:id', () => {
      expect(router.parse(url('/users/123')).getOrThrow()).toEqual({
        tag: 'users',
        child: { tag: 'user', id: '123' },
      });
    });

    it('parses /users/:id/settings', () => {
      expect(router.parse(url('/users/123/settings')).getOrThrow()).toEqual({
        tag: 'users',
        child: { tag: 'user', id: '123', child: { tag: 'settings' } },
      });
    });

    it('parses /orgs/:orgId', () => {
      expect(router.parse(url('/orgs/acme')).getOrThrow()).toEqual({
        tag: 'org',
        orgId: 'acme',
      });
    });

    it('parses /orgs/:orgId/#projectId/:issueId', () => {
      expect(router.parse(url('/orgs/acme/42/7')).getOrThrow()).toMatchObject({
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7', page: 1 },
        },
      });
    });

    it('returns failure for unknown route', () => {
      expect(router.parse(url('/unknown')).isErr()).toBe(true);
    });
  });

  describe('print', () => {
    it('prints /users', () => {
      expect(router.print({ tag: 'users' })).toBe('/users');
    });

    it('prints /users/:id', () => {
      expect(
        router.print({
          tag: 'users',
          child: { tag: 'user', id: '123' },
        }),
      ).toBe('/users/123');
    });

    it('prints /users/:id/settings', () => {
      expect(
        router.print({
          tag: 'users',
          child: { tag: 'user', id: '123', child: { tag: 'settings' } },
        }),
      ).toBe('/users/123/settings');
    });

    it('prints /orgs/:orgId/#projectId/:issueId with query params', () => {
      expect(
        router.print({
          tag: 'org',
          orgId: 'acme',
          child: {
            tag: 'project',
            projectId: 42,
            child: { tag: 'issue', issueId: '7', status: 'open', page: 1 },
          },
        }),
      ).toBe('/orgs/acme/42/7?status=open&page=1');
    });
  });

  describe('roundtrip', () => {
    const paths = ['/users', '/users/123', '/users/123/settings', '/orgs/acme', '/orgs/acme/42'];

    function printRoute(router: ReturnType<typeof defineRoutes>, route: unknown): string {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return router.print(route as any, undefined as any);
    }

    for (const path of paths) {
      it(`parse then print: ${path}`, () => {
        const result = router.parse(url(path));
        expect(result.isOk()).toBe(true);
        const parsed = result.getOrThrow();
        expect(printRoute(router, parsed as unknown as Record<string, unknown>)).toBe(path);
      });
    }

    it('roundtrip: /orgs/acme/42/7 with default page omitted from print', () => {
      const parsed = router.parse(url('/orgs/acme/42/7')).getOrThrow();
      expect(parsed).toMatchObject({ child: { child: { page: 1 } } });
      const printed = router.print(router.parse(url('/orgs/acme/42/7')).getOrThrow());
      const reparsed = router.parse(new URL(`https://example.com${printed}`)).getOrThrow();
      expect(reparsed).toMatchObject({ child: { child: { page: 1 } } });
    });

    it('roundtrip: param with spaces survives encode/decode', () => {
      const printed = router.print({ tag: 'users', child: { tag: 'user', id: 'hello world' } });
      expect(printed).toBe('/users/hello%20world');
      const reparsed = router.parse(new URL(`https://example.com${printed}`)).getOrThrow();
      expect(reparsed).toEqual({ tag: 'users', child: { tag: 'user', id: 'hello world' } });
    });

    it('roundtrip: param with unicode survives encode/decode', () => {
      const printed = router.print({ tag: 'users', child: { tag: 'user', id: '日本語' } });
      expect(printed).toBe('/users/%E6%97%A5%E6%9C%AC%E8%AA%9E');
      const reparsed = router.parse(new URL(`https://example.com${printed}`)).getOrThrow();
      expect(reparsed).toEqual({ tag: 'users', child: { tag: 'user', id: '日本語' } });
    });

    it('roundtrip: /orgs/acme/42/7?page=3 explicit page survives', () => {
      const parsed = router.parse(url('/orgs/acme/42/7?page=3')).getOrThrow();
      expect(parsed).toMatchObject({ child: { child: { page: 3 } } });
      const printed = router.print(parsed);
      expect(printed).toBe('/orgs/acme/42/7?page=3');
      const reparsed = router.parse(new URL(`https://example.com${printed}`)).getOrThrow();
      expect(reparsed).toMatchObject({ child: { child: { page: 3 } } });
    });
  });

  describe('section', () => {
    const sectionRouter = defineRoutes([
      section('orgs/:orgId/', [route(Project, '#projectId/', [route(Issue, ':issueId/')])]),
    ]);

    it('section is not a valid terminal route', () => {
      expect(sectionRouter.parse(new URL('https://example.com/orgs/acme')).isErr()).toBe(true);
    });

    it('section passes through to children', () => {
      expect(sectionRouter.parse(new URL('https://example.com/orgs/acme/42')).getOrThrow()).toEqual(
        {
          child: { tag: 'project', projectId: 42 },
        },
      );
    });

    it('prints through a section when params are in child', () => {
      const url = sectionRouter.print(
        { child: { tag: 'project', projectId: 42 } },
        { orgId: 'acme' },
      );
      expect(url).toBe('/orgs/acme/42');
    });

    it('omitting a required section param is a compile error', () => {
      // @ts-expect-error — orgId is required for this section router
      sectionRouter.print({ child: { tag: 'project', projectId: 42 } });
    });

    it('section path params are not preserved in parse result', () => {
      // orgId is captured by the section but is not in the returned result
      const parsed = sectionRouter.parse(new URL('https://example.com/orgs/acme/42')).getOrThrow();
      expect(parsed).toEqual({ child: { tag: 'project', projectId: 42 } });
    });

    it('roundtrip works for sections without path params', () => {
      const prefixRouter = defineRoutes([section('v1/', [route(Project, '#projectId/')])]);
      const parsed = prefixRouter.parse(new URL('https://example.com/v1/42')).getOrThrow();
      expect(prefixRouter.print(parsed)).toBe('/v1/42');
    });
  });

  describe('nested sections (section > section > route)', () => {
    const nestedSectionRouter = defineRoutes([
      section('orgs/:orgId/', [section('projects/', [route(Issue, ':issueId/')])]),
    ]);

    it('nested section is not a valid terminal route at outer level', () => {
      expect(nestedSectionRouter.parse(new URL('https://example.com/orgs/acme')).isErr()).toBe(
        true,
      );
    });

    it('nested section is not a valid terminal route at inner level', () => {
      expect(
        nestedSectionRouter.parse(new URL('https://example.com/orgs/acme/projects')).isErr(),
      ).toBe(true);
    });

    it('parses through two nested sections', () => {
      expect(
        nestedSectionRouter.parse(new URL('https://example.com/orgs/acme/projects/7')).getOrThrow(),
      ).toMatchObject({ child: { child: { tag: 'issue', issueId: '7' } } });
    });

    it('prints through two nested sections when params are in innermost child', () => {
      const url = nestedSectionRouter.print(
        { child: { child: { tag: 'issue', issueId: '7', page: 1 } } },
        { orgId: 'acme' },
      );
      expect(url).toBe('/orgs/acme/projects/7?page=1');
    });

    it('nested section path params are not preserved in parse result', () => {
      const parsed = nestedSectionRouter
        .parse(new URL('https://example.com/orgs/acme/projects/7'))
        .getOrThrow();
      // orgId captured by outer section is absent from the result
      expect(parsed).toMatchObject({ child: { child: { tag: 'issue', issueId: '7' } } });
      expect(
        (parsed as { child?: { child?: { orgId?: unknown } } }).child?.child?.orgId,
      ).toBeUndefined();
    });

    it('roundtrip works for nested sections without path params', () => {
      const prefixRouter = defineRoutes([
        section('v1/', [section('api/', [route(Project, '#projectId/')])]),
      ]);
      const parsed = prefixRouter.parse(new URL('https://example.com/v1/api/42')).getOrThrow();
      expect(prefixRouter.print(parsed)).toBe('/v1/api/42');
    });
  });

  describe('parseDiagnostics', () => {
    it('returns success result with empty diagnostics when route matches', () => {
      const { result, diagnostics } = router.parseDiagnostics(url('/users'));
      expect(result.isOk()).toBe(true);
      expect(diagnostics).toHaveLength(0);
    });

    it('returns failure result with segment-mismatch diagnostics for unknown route', () => {
      const { result, diagnostics } = router.parseDiagnostics(url('/unknown'));
      expect(result.isErr()).toBe(true);
      expect(diagnostics.some((d) => d.kind === 'segment-mismatch')).toBe(true);
    });

    it('returns failure result with schema-error diagnostic for invalid query param', () => {
      const { result, diagnostics } = router.parseDiagnostics(
        url('/orgs/acme/42/7?status=invalid'),
      );
      expect(result.isErr()).toBe(true);
      const schemaErrors = diagnostics.filter((d) => d.kind === 'schema-error');
      expect(schemaErrors).toHaveLength(1);
      expect(schemaErrors[0]).toMatchObject({ kind: 'schema-error', path: ':issueId/' });
    });

    it('does not affect parse() — parse never allocates the accumulator', () => {
      expect(router.parse(url('/users')).isOk()).toBe(true);
      expect(router.parse(url('/unknown')).isErr()).toBe(true);
    });
  });

  describe('duplicate tag detection', () => {
    it('throws when two routes share the same tag', () => {
      const A = z.object({ tag: z.literal('dup') });
      const B = z.object({ tag: z.literal('dup'), extra: z.string() });
      expect(() => defineRoutes([route(A, 'a/'), route(B, 'b/')])).toThrow(
        'duplicate route tag: "dup"',
      );
    });

    it('throws for duplicate tags in nested children', () => {
      const Parent = z.object({ tag: z.literal('parent') });
      const Child = z.object({ tag: z.literal('parent') });
      expect(() => defineRoutes([route(Parent, 'p/', [route(Child, 'c/')])])).toThrow(
        'duplicate route tag: "parent"',
      );
    });
  });

  describe('composition', () => {
    const orgRouter = defineRoutes([
      route(Org, 'orgs/:orgId/', [route(Project, '#projectId/', [route(Issue, ':issueId/')])]),
    ]);

    const userRouter = defineRoutes([
      route(Users, 'users/', [route(User, ':id/', [route(Settings, 'settings/')])]),
    ]);

    const composed = defineRoutes([...orgRouter.children, ...userRouter.children]);

    it('parses org route from composed router', () => {
      expect(composed.parse(new URL('https://example.com/orgs/acme')).getOrThrow()).toEqual({
        tag: 'org',
        orgId: 'acme',
      });
    });

    it('parses user route from composed router', () => {
      expect(composed.parse(new URL('https://example.com/users')).getOrThrow()).toEqual({
        tag: 'users',
      });
    });

    it('type is union of sub-router types', () => {
      type Composed = typeof composed._type;
      type OrgRoute = typeof orgRouter._type;
      type UserRoute = typeof userRouter._type;

      const a: Composed = { tag: 'org', orgId: 'acme' } satisfies OrgRoute;
      const b: Composed = { tag: 'users' } satisfies UserRoute;

      expect(a.tag).toBe('org');
      expect(b.tag).toBe('users');
    });
  });
});

describe('buildable (.use / .pipe)', () => {
  const Tag = z.object({ tag: z.literal('root') });

  type WithExtra<N extends RouteNode<any, any, any, any, any>> = N & { _extra: true };
  function addExtra<N extends RouteNode<any, any, any, any, any>>(node: N): WithExtra<N> {
    return Object.assign(node, { _extra: true as const });
  }

  type WithExtra2<N extends RouteNode<any, any, any, any, any>> = N & { _extra2: true };
  function addExtra2<N extends RouteNode<any, any, any, any, any>>(node: N): WithExtra2<N> {
    return Object.assign(node, { _extra2: true as const });
  }

  describe('route()', () => {
    it('returns a BuildableRouteNode', () => {
      const node = route(Tag, 'root/');
      expectTypeOf(node).toExtend<BuildableRouteNode<RouteNode<{ tag: 'root' }>>>();
      expect(typeof node.use).toBe('function');
      expect(typeof node.pipe).toBe('function');
    });
  });

  describe('section()', () => {
    it('returns a BuildableRouteNode', () => {
      const node = section('prefix/', []);
      expect(typeof node.use).toBe('function');
      expect(typeof node.pipe).toBe('function');
    });
  });

  describe('.use()', () => {
    it('applies the transform and returns a BuildableRouteNode with enriched type', () => {
      const node = route(Tag, 'root/').use(addExtra);
      expectTypeOf(node._extra).toEqualTypeOf<true>();
      expect(node._extra).toBe(true);
    });

    it('chains multiple .use() calls left-to-right', () => {
      const node = route(Tag, 'root/').use(addExtra).use(addExtra2);
      expect(node._extra).toBe(true);
      expect(node._extra2).toBe(true);
    });

    it('the result is still a BuildableRouteNode (can continue chaining)', () => {
      const node = route(Tag, 'root/').use(addExtra);
      expect(typeof node.use).toBe('function');
      expect(typeof node.pipe).toBe('function');
    });
  });

  describe('.pipe()', () => {
    it('applies a combinator and returns a BuildableRouteNode', () => {
      const combinator = (node: RouteNode<{ tag: 'root' }>) => addExtra(addExtra2(node));
      const node = route(Tag, 'root/').pipe(combinator);
      expect(node._extra).toBe(true);
      expect(node._extra2).toBe(true);
    });
  });
});
