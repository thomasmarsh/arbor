/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from 'vitest';
import z from 'zod';
import { defineRoutes, route, section } from './define-routes.js';

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

    function printRoute(router: ReturnType<typeof defineRoutes>, route: unknown): string {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return router.print(route as any);
    }

    for (const path of paths) {
      it(`parse then print: ${path}`, () => {
        const result = router.parse(url(path));
        expect(result.isSuccess()).toBe(true);
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
      expect(sectionRouter.parse(new URL('https://example.com/orgs/acme')).isFailure()).toBe(true);
    });

    it('section passes through to children', () => {
      expect(sectionRouter.parse(new URL('https://example.com/orgs/acme/42')).getOrThrow()).toEqual(
        {
          child: { tag: 'project', projectId: 42 },
        },
      );
    });

    it('prints through a section when params are in child', () => {
      // orgId is a runtime extra: not in the type but used by buildUrl to fill the section's path param
      expect(
        sectionRouter.print({ child: { tag: 'project', projectId: 42, orgId: 'acme' } } as any),
      ).toBe('/orgs/acme/42');
    });

    it('section path params are not preserved in parse result', () => {
      // orgId is captured by the section but is not in the returned result
      const parsed = sectionRouter
        .parse(new URL('https://example.com/orgs/acme/42'))
        .getOrThrow();
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
      expect(
        nestedSectionRouter.parse(new URL('https://example.com/orgs/acme')).isFailure(),
      ).toBe(true);
    });

    it('nested section is not a valid terminal route at inner level', () => {
      expect(
        nestedSectionRouter.parse(new URL('https://example.com/orgs/acme/projects')).isFailure(),
      ).toBe(true);
    });

    it('parses through two nested sections', () => {
      expect(
        nestedSectionRouter
          .parse(new URL('https://example.com/orgs/acme/projects/7'))
          .getOrThrow(),
      ).toMatchObject({ child: { child: { tag: 'issue', issueId: '7' } } });
    });

    it('prints through two nested sections when params are in innermost child', () => {
      // orgId is a runtime extra: not in the type but used by buildUrl to fill the outer section's path param
      expect(
        nestedSectionRouter.print({
          child: { child: { tag: 'issue', issueId: '7', orgId: 'acme' } },
        } as any),
      ).toBe('/orgs/acme/projects/7');
    });

    it('nested section path params are not preserved in parse result', () => {
      const parsed = nestedSectionRouter
        .parse(new URL('https://example.com/orgs/acme/projects/7'))
        .getOrThrow();
      // orgId captured by outer section is absent from the result
      expect(parsed).toMatchObject({ child: { child: { tag: 'issue', issueId: '7' } } });
      expect((parsed as { child?: { child?: { orgId?: unknown } } }).child?.child?.orgId).toBeUndefined();
    });

    it('roundtrip works for nested sections without path params', () => {
      const prefixRouter = defineRoutes([
        section('v1/', [section('api/', [route(Project, '#projectId/')])]),
      ]);
      const parsed = prefixRouter
        .parse(new URL('https://example.com/v1/api/42'))
        .getOrThrow();
      expect(prefixRouter.print(parsed)).toBe('/v1/api/42');
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
