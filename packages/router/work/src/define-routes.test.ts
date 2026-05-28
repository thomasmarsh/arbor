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
