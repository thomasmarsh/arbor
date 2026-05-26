/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unnecessary-type-arguments */
import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import {
  buildUrl,
  defineRoutes,
  matchSegments,
  parseSegments,
  route,
  section,
  walkParse,
  walkPrint,
  type ChildUnion,
  type Derive,
  type Flatten,
  type InferRoute,
  type RouteNode,
} from './define-routes';

describe('Flatten', () => {
  it('cleans up an intersection', () => {
    type T = Flatten<{ tag: 'user' } & { id: string }>;
    expectTypeOf<T>().toEqualTypeOf<{ tag: 'user'; id: string }>();
  });

  it('cleans up a nested intersection', () => {
    type T = Flatten<{ tag: 'user' } & { child?: { tag: 'settings' } & { id: string } }>;
    expectTypeOf<T>().toEqualTypeOf<{
      tag: 'user';
      child?: { tag: 'settings' } & { id: string };
    }>();
  });

  it('is a no-op on a plain object', () => {
    type T = Flatten<{ tag: 'user'; id: string }>;
    expectTypeOf<T>().toEqualTypeOf<{ tag: 'user'; id: string }>();
  });
});

describe('InferRoute', () => {
  it('extracts the route type from a router', () => {
    // stub a minimal router shape for testing
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stubRouter = {
      _type: undefined as never as { tag: 'users' } | { tag: 'user'; id: string },
    };

    expectTypeOf<InferRoute<typeof stubRouter>>().toEqualTypeOf<
      { tag: 'users' } | { tag: 'user'; id: string }
    >();
  });

  it('works with a nested route type', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stubRouter = {
      _type: undefined as never as
        | { tag: 'users'; child?: { tag: 'user'; id: string } }
        | { tag: 'org'; orgId: string },
    };

    expectTypeOf<InferRoute<typeof stubRouter>>().toEqualTypeOf<
      { tag: 'users'; child?: { tag: 'user'; id: string } } | { tag: 'org'; orgId: string }
    >();
  });
});

describe('parseSegments', () => {
  describe('literals', () => {
    it('parses a single literal', () => {
      expect(parseSegments('users/')).toEqual([{ kind: 'lit', value: 'users' }]);
    });

    it('parses multiple literals', () => {
      expect(parseSegments('orgs/projects/')).toEqual([
        { kind: 'lit', value: 'orgs' },
        { kind: 'lit', value: 'projects' },
      ]);
    });
  });

  describe('params', () => {
    it('parses a string param', () => {
      expect(parseSegments(':id/')).toEqual([{ kind: 'str', name: 'id' }]);
    });

    it('parses a number param', () => {
      expect(parseSegments('#id/')).toEqual([{ kind: 'num', name: 'id' }]);
    });

    it('parses an optional string param', () => {
      expect(parseSegments(':id?/')).toEqual([{ kind: 'opt-str', name: 'id' }]);
    });

    it('parses an optional number param', () => {
      expect(parseSegments('#id?/')).toEqual([{ kind: 'opt-num', name: 'id' }]);
    });

    it('parses a wildcard', () => {
      expect(parseSegments('*rest/')).toEqual([{ kind: 'wildcard', name: 'rest' }]);
    });
  });

  describe('mixed', () => {
    it('parses literal then param', () => {
      expect(parseSegments('users/:id/')).toEqual([
        { kind: 'lit', value: 'users' },
        { kind: 'str', name: 'id' },
      ]);
    });

    it('parses literal then number param then literal', () => {
      expect(parseSegments('orgs/#id/projects/')).toEqual([
        { kind: 'lit', value: 'orgs' },
        { kind: 'num', name: 'id' },
        { kind: 'lit', value: 'projects' },
      ]);
    });

    it('parses optional param followed by wildcard', () => {
      expect(parseSegments(':id?/*rest/')).toEqual([
        { kind: 'opt-str', name: 'id' },
        { kind: 'wildcard', name: 'rest' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles empty path', () => {
      expect(parseSegments('')).toEqual([]);
    });

    it('handles root slash only', () => {
      expect(parseSegments('/')).toEqual([]);
    });

    it('handles path without trailing slash', () => {
      expect(parseSegments('users')).toEqual([{ kind: 'lit', value: 'users' }]);
    });
  });
});

describe('Derive', () => {
  it('leaf node — no child field', () => {
    type N = RouteNode<{ tag: 'user'; id: string }, never, []>;
    expectTypeOf<Derive<N>>().toEqualTypeOf<{ tag: 'user'; id: string }>();
  });

  it('tagged node with children — optional child', () => {
    type N = RouteNode<{ tag: 'users' }, { tag: 'user'; id: string }, []>;
    expectTypeOf<Derive<N>>().toEqualTypeOf<{
      tag: 'users';
      child?: { tag: 'user'; id: string };
    }>();
  });

  it('section node — required child', () => {
    type N = RouteNode<never, { tag: 'user'; id: string }, []>;
    expectTypeOf<Derive<N>>().toEqualTypeOf<{
      child: { tag: 'user'; id: string };
    }>();
  });

  it('section node — child cannot be undefined', () => {
    type N = RouteNode<never, { tag: 'user'; id: string }, []>;
    type D = Derive<N>;
    interface Key {
      child: { tag: 'user'; id: string };
    }

    // child is required — assignability check
    expectTypeOf<Key>().toExtend<D>();
  });
});

describe('ChildUnion', () => {
  it('union of two leaves', () => {
    type C = [
      RouteNode<{ tag: 'users' }, never, []>,
      RouteNode<{ tag: 'org'; orgId: string }, never, []>,
    ];
    expectTypeOf<ChildUnion<C>>().toEqualTypeOf<{ tag: 'users' } | { tag: 'org'; orgId: string }>();
  });

  it('union including a section', () => {
    type C = [
      RouteNode<never, { tag: 'user'; id: string }, []>,
      RouteNode<{ tag: 'org'; orgId: string }, never, []>,
    ];
    expectTypeOf<ChildUnion<C>>().toEqualTypeOf<
      { child: { tag: 'user'; id: string } } | { tag: 'org'; orgId: string }
    >();
  });
});

describe('matchSegments', () => {
  describe('literals', () => {
    it('matches a literal', () => {
      const segs = parseSegments('users/');
      expect(matchSegments(segs, ['users'], {})).toEqual({
        params: {},
        rest: [],
      });
    });

    it('fails a wrong literal', () => {
      const segs = parseSegments('users/');
      expect(matchSegments(segs, ['orgs'], {})).toBeNull();
    });

    it('leaves unmatched segments in rest', () => {
      const segs = parseSegments('users/');
      expect(matchSegments(segs, ['users', '123'], {})).toEqual({
        params: {},
        rest: ['123'],
      });
    });
  });

  describe('required params', () => {
    it('captures a string param', () => {
      const segs = parseSegments(':id/');
      expect(matchSegments(segs, ['123'], {})).toEqual({
        params: { id: '123' },
        rest: [],
      });
    });

    it('captures a number param', () => {
      const segs = parseSegments('#id/');
      expect(matchSegments(segs, ['42'], {})).toEqual({
        params: { id: 42 },
        rest: [],
      });
    });

    it('fails a non-numeric number param', () => {
      const segs = parseSegments('#id/');
      expect(matchSegments(segs, ['abc'], {})).toBeNull();
    });

    it('fails when required param is missing', () => {
      const segs = parseSegments(':id/');
      expect(matchSegments(segs, [], {})).toBeNull();
    });
  });

  describe('optional params', () => {
    it('captures an optional string param when present', () => {
      const segs = parseSegments(':id?/');
      expect(matchSegments(segs, ['123'], {})).toEqual({
        params: { id: '123' },
        rest: [],
      });
    });

    it('skips an optional string param when absent', () => {
      const segs = parseSegments(':id?/');
      expect(matchSegments(segs, [], {})).toEqual({
        params: {},
        rest: [],
      });
    });

    it('captures an optional number param when present', () => {
      const segs = parseSegments('#id?/');
      expect(matchSegments(segs, ['42'], {})).toEqual({
        params: { id: 42 },
        rest: [],
      });
    });

    it('skips an optional number param when not a number', () => {
      const segs = parseSegments('#id?/');
      expect(matchSegments(segs, ['abc'], {})).toEqual({
        params: {},
        rest: ['abc'],
      });
    });
  });

  describe('wildcard', () => {
    it('captures all remaining segments', () => {
      const segs = parseSegments('*rest/');
      expect(matchSegments(segs, ['a', 'b', 'c'], {})).toEqual({
        params: { rest: ['a', 'b', 'c'] },
        rest: [],
      });
    });

    it('captures zero remaining segments', () => {
      const segs = parseSegments('*rest/');
      expect(matchSegments(segs, [], {})).toEqual({
        params: { rest: [] },
        rest: [],
      });
    });

    it('captures after a literal', () => {
      const segs = parseSegments('files/*rest/');
      expect(matchSegments(segs, ['files', 'a', 'b'], {})).toEqual({
        params: { rest: ['a', 'b'] },
        rest: [],
      });
    });
  });

  describe('mixed', () => {
    it('matches literal then required param', () => {
      const segs = parseSegments('users/:id/');
      expect(matchSegments(segs, ['users', '123', 'settings'], {})).toEqual({
        params: { id: '123' },
        rest: ['settings'],
      });
    });
    it('accumulates inherited params', () => {
      const segs = parseSegments('#projectId/');
      expect(matchSegments(segs, ['42'], { orgId: 'acme' })).toEqual({
        params: { orgId: 'acme', projectId: 42 },
        rest: [],
      });
    });
  });
});

describe('walkParse', () => {
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

  const nodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any>[]>[] = [
    {
      _type: undefined,
      _child: undefined,
      schema: Users,
      path: 'users/',
      children: [
        {
          _type: undefined,
          _child: undefined,
          schema: User,
          path: ':id/',
          children: [
            {
              _type: undefined,
              _child: undefined,
              schema: Settings,
              path: 'settings/',
              children: [],
            },
          ],
        },
      ],
    },
    {
      _type: undefined,
      _child: undefined,
      schema: Org,
      path: 'orgs/:orgId/',
      children: [
        {
          _type: undefined,
          _child: undefined,
          schema: Project,
          path: '#projectId/',
          children: [
            {
              _type: undefined,
              _child: undefined,
              schema: Issue,
              path: ':issueId/',
              children: [],
            },
          ],
        },
      ],
    },
  ];

  const q = (search = '') => new URLSearchParams(search);

  describe('single level', () => {
    it('matches /users', () => {
      expect(walkParse(nodes, ['users'], q(), {})).toEqual({ tag: 'users' });
    });

    it('matches /orgs/:orgId', () => {
      expect(walkParse(nodes, ['orgs', 'acme'], q(), {})).toEqual({
        tag: 'org',
        orgId: 'acme',
      });
    });
  });

  describe('two levels', () => {
    it('matches /users/:id', () => {
      expect(walkParse(nodes, ['users', '123'], q(), {})).toEqual({
        tag: 'users',
        child: { tag: 'user', id: '123' },
      });
    });

    it('matches /orgs/:orgId/#projectId', () => {
      expect(walkParse(nodes, ['orgs', 'acme', '42'], q(), {})).toEqual({
        tag: 'org',
        orgId: 'acme',
        child: { tag: 'project', projectId: 42 },
      });
    });
  });

  describe('three levels', () => {
    it('matches /users/:id/settings', () => {
      expect(walkParse(nodes, ['users', '123', 'settings'], q(), {})).toEqual({
        tag: 'users',
        child: {
          tag: 'user',
          id: '123',
          child: { tag: 'settings' },
        },
      });
    });

    it('matches /orgs/:orgId/#projectId/#issueId', () => {
      expect(walkParse(nodes, ['orgs', 'acme', '42', '7'], q(), {})).toMatchObject({
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7', page: 1 },
        },
      });
    });
  });

  describe('query params', () => {
    it('parses status on issue', () => {
      expect(walkParse(nodes, ['orgs', 'acme', '42', '7'], q('status=open'), {})).toMatchObject({
        child: { child: { status: 'open' } },
      });
    });

    it('applies default page', () => {
      expect(walkParse(nodes, ['orgs', 'acme', '42', '7'], q(), {})).toMatchObject({
        child: { child: { page: 1 } },
      });
    });

    it('coerces page to number', () => {
      expect(walkParse(nodes, ['orgs', 'acme', '42', '7'], q('page=3'), {})).toMatchObject({
        child: { child: { page: 3 } },
      });
    });

    it('rejects invalid status', () => {
      expect(walkParse(nodes, ['orgs', 'acme', '42', '7'], q('status=invalid'), {})).toBeNull();
    });
  });

  describe('section nodes', () => {
    const sectionNodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any>[]>[] = [
      {
        _type: undefined,
        _child: undefined,
        schema: null,
        path: 'orgs/:orgId/',
        children: [
          {
            _type: undefined,
            _child: undefined,
            schema: Project,
            path: '#projectId/',
            children: [],
          },
        ],
      },
    ];

    it('section is not a valid terminal route', () => {
      expect(walkParse(sectionNodes, ['orgs', 'acme'], q(), {})).toBeNull();
    });

    it('section passes through to children', () => {
      expect(walkParse(sectionNodes, ['orgs', 'acme', '42'], q(), {})).toEqual({
        child: { tag: 'project', projectId: 42 },
      });
    });
  });

  describe('no match', () => {
    it('returns null for unknown route', () => {
      expect(walkParse(nodes, ['unknown'], q(), {})).toBeNull();
    });

    it('returns null for non-numeric projectId', () => {
      expect(walkParse(nodes, ['orgs', 'acme', 'abc'], q(), {})).toBeNull();
    });

    it('returns null for too many segments', () => {
      expect(walkParse(nodes, ['users', '123', 'settings', 'extra'], q(), {})).toBeNull();
    });
  });
});

describe('walkPrint', () => {
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

  const nodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any>[]>[] = [
    {
      _type: undefined,
      _child: undefined,
      schema: Users,
      path: 'users/',
      children: [
        {
          _type: undefined,
          _child: undefined,
          schema: User,
          path: ':id/',
          children: [
            {
              _type: undefined,
              _child: undefined,
              schema: Settings,
              path: 'settings/',
              children: [],
            },
          ],
        },
      ],
    },
    {
      _type: undefined,
      _child: undefined,
      schema: Org,
      path: 'orgs/:orgId/',
      children: [
        {
          _type: undefined,
          _child: undefined,
          schema: Project,
          path: '#projectId/',
          children: [
            {
              _type: undefined,
              _child: undefined,
              schema: Issue,
              path: ':issueId/',
              children: [],
            },
          ],
        },
      ],
    },
  ];

  const empty = { segments: [], paramNames: new Set<string>() };

  describe('single level', () => {
    it('prints /users', () => {
      const result = walkPrint(nodes, { tag: 'users' }, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, { tag: 'users' })).toBe('/users');
    });

    it('prints /orgs/:orgId', () => {
      const route = { tag: 'org', orgId: 'acme' };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme');
    });
  });

  describe('two levels', () => {
    it('prints /users/:id', () => {
      const route = { tag: 'users', child: { tag: 'user', id: '123' } };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/users/123');
    });

    it('prints /orgs/:orgId/#projectId', () => {
      const route = { tag: 'org', orgId: 'acme', child: { tag: 'project', projectId: 42 } };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme/42');
    });
  });

  describe('three levels', () => {
    it('prints /users/:id/settings', () => {
      const route = {
        tag: 'users',
        child: { tag: 'user', id: '123', child: { tag: 'settings' } },
      };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/users/123/settings');
    });

    it('prints /orgs/:orgId/#projectId/:issueId', () => {
      const route = {
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7' }, // no page — omit default
        },
      };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme/42/7');
    });
  });
  describe('query params', () => {
    it('appends status to url', () => {
      const route = {
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7', status: 'open' }, // no page
        },
      };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme/42/7?status=open');
    });

    it('appends page when not default', () => {
      const route = {
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7', page: 3 },
        },
      };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme/42/7?page=3');
    });

    it('appends multiple query params', () => {
      const route = {
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7', status: 'open', page: 3 },
        },
      };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      const url = buildUrl(result!, route);
      expect(url).toContain('/orgs/acme/42/7');
      expect(url).toContain('status=open');
      expect(url).toContain('page=3');
    });

    it('omits undefined query params', () => {
      const route = {
        tag: 'org',
        orgId: 'acme',
        child: {
          tag: 'project',
          projectId: 42,
          child: { tag: 'issue', issueId: '7', page: 1 },
        },
      };
      const result = walkPrint(nodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).not.toContain('status');
    });
  });

  describe('no match', () => {
    it('returns null for unknown tag', () => {
      expect(walkPrint(nodes, { tag: 'unknown' }, empty)).toBeNull();
    });
  });
});

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

  //   type Route = typeof router._type;

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
      expect(router.parse(url('/unknown')).isFailure()).toBe(true);
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

    // function stripDefaults(route: Record<string, unknown>): Record<string, unknown> {
    //   const result: Record<string, unknown> = {};
    //   for (const [k, v] of Object.entries(route)) {
    //     if (k === 'page' && v === 1) continue;
    //     if (k === 'child' && v != null) result[k] = stripDefaults(v as Record<string, unknown>);
    //     else result[k] = v;
    //   }
    //   return result;
    // }

    function printRoute(router: ReturnType<typeof defineRoutes>, route: unknown): string {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return router.print(route as any);
    }

    for (const path of paths) {
      it(`parse then print: ${path}`, () => {
        const result = router.parse(url(path));
        expect(result.isSuccess()).toBe(true);
        const parsed = result.getOrThrow();
        expect(
          //   printRoute(router, stripDefaults(parsed as unknown as Record<string, unknown>)),
          printRoute(router, parsed as unknown as Record<string, unknown>),
        ).toBe(path);
      });
    }

    it('roundtrip: /orgs/acme/42/7 with default page omitted from print', () => {
      const parsed = router.parse(url('/orgs/acme/42/7')).getOrThrow();
      // parse applies default: page=1 is in the parsed result
      expect(parsed).toMatchObject({ child: { child: { page: 1 } } });
      // print omits page=1 since it wasn't in the original URL
      // so we print without page and parse again to verify roundtrip
      const printed = router.print(router.parse(url('/orgs/acme/42/7')).getOrThrow());
      const reparsed = router.parse(new URL(`https://example.com${printed}`)).getOrThrow();
      expect(reparsed).toMatchObject({ child: { child: { page: 1 } } });
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
      expect(sectionRouter.parse(new URL('https://example.com/orgs/acme')).isFailure()).toBe(true);
    });

    it('section passes through to children', () => {
      expect(sectionRouter.parse(new URL('https://example.com/orgs/acme/42')).getOrThrow()).toEqual(
        {
          child: { tag: 'project', projectId: 42 },
        },
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
