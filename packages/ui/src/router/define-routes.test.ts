import type { Result } from '@arbor/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineRoutes } from './define-routes.js';

const router = defineRoutes({
  'users/': {
    tag: 'users',
    children: {
      ':id/': {
        tag: 'user',
        children: {
          'settings/': 'user-settings',
        },
      },
    },
  },
  'orgs/:orgId/projects/': {
    tag: 'org',
    children: {
      '#projectId/issues/': {
        tag: 'project',
        query: {
          status: z.enum(['open', 'closed']).optional(),
          page: z.coerce.number().default(1),
        },
        children: {
          ':issueId/': 'issue',
        },
      },
      '#projectId/settings/': {
        tag: 'project-settings',
        children: {
          'members/': 'project-members',
        },
      },
    },
  },
});

const url = (path: string) => new URL(`https://example.com${path}`);

function unwrap<T>(result: Result<T, string>): T {
  if (!result.isSuccess())
    throw new Error(`Expected success but got failure: ${JSON.stringify(result)}`);
  return result.getOrElse(null as never);
}

// ── parse ─────────────────────────────────────────────────────────────────────

describe('parse', () => {
  describe('static routes', () => {
    it('matches /users', () => {
      expect(unwrap(router.parse(url('/users')))).toEqual({ tag: 'users' });
    });

    it('matches /users/:id', () => {
      expect(unwrap(router.parse(url('/users/123')))).toEqual({ tag: 'user', id: '123' });
    });

    it('matches /users/:id/settings', () => {
      expect(unwrap(router.parse(url('/users/123/settings')))).toEqual({
        tag: 'user-settings',
        id: '123',
      });
    });
  });

  describe('nested params', () => {
    it('matches /orgs/:orgId/projects', () => {
      expect(unwrap(router.parse(url('/orgs/acme/projects')))).toEqual({
        tag: 'org',
        orgId: 'acme',
      });
    });

    it('matches /orgs/:orgId/projects/:projectId/issues', () => {
      expect(unwrap(router.parse(url('/orgs/acme/projects/42/issues')))).toMatchObject({
        tag: 'project',
        orgId: 'acme',
        projectId: 42,
        page: 1, // default
      });
    });

    it('matches /orgs/:orgId/projects/:projectId/issues with query params', () => {
      expect(unwrap(router.parse(url('/orgs/acme/projects/42/issues?status=open&page=3')))).toEqual(
        {
          tag: 'project',
          orgId: 'acme',
          projectId: 42,
          status: 'open',
          page: 3,
        },
      );
    });

    it('matches /orgs/:orgId/projects/:projectId/issues/:issueId', () => {
      expect(unwrap(router.parse(url('/orgs/acme/projects/42/issues/7')))).toEqual({
        tag: 'issue',
        orgId: 'acme',
        projectId: 42,
        issueId: '7',
      });
    });

    it('matches /orgs/:orgId/projects/:projectId/settings', () => {
      expect(unwrap(router.parse(url('/orgs/acme/projects/42/settings')))).toMatchObject({
        tag: 'project-settings',
        orgId: 'acme',
        projectId: 42,
      });
    });

    it('matches /orgs/:orgId/projects/:projectId/settings/members', () => {
      expect(unwrap(router.parse(url('/orgs/acme/projects/42/settings/members')))).toEqual({
        tag: 'project-members',
        orgId: 'acme',
        projectId: 42,
      });
    });
  });

  describe('query params', () => {
    it('applies default page value when not provided', () => {
      const result = router.parse(url('/orgs/acme/projects/42/issues'));
      expect(unwrap(result)).toMatchObject({ page: 1 });
    });

    it('coerces page to number', () => {
      const result = router.parse(url('/orgs/acme/projects/42/issues?page=5'));
      expect(unwrap(result)).toMatchObject({ page: 5 });
    });

    it('rejects invalid status enum', () => {
      const result = router.parse(url('/orgs/acme/projects/42/issues?status=invalid'));
      expect(result.isFailure()).toBe(true); // or Result.failure depending on your Result shape
    });

    it('ignores unknown query params', () => {
      const result = router.parse(url('/orgs/acme/projects/42/issues?unknown=foo'));
      expect(unwrap(result)).toMatchObject({ tag: 'project' });
    });
  });

  describe('no match', () => {
    it('returns failure for unknown route', () => {
      const result = router.parse(url('/unknown'));
      expect(result.isFailure()).toBe(true);
    });

    it('returns failure for partial match', () => {
      // /users/:id exists but /users/:id/:anything does not
      const result = router.parse(url('/users/123/unknown'));
      expect(result.isFailure()).toBe(true);
    });

    it('returns failure for non-numeric projectId', () => {
      const result = router.parse(url('/orgs/acme/projects/not-a-number/issues'));
      expect(result.isFailure()).toBe(true);
    });
  });
});

// ── print ─────────────────────────────────────────────────────────────────────

describe('print', () => {
  it('prints /users', () => {
    expect(router.print({ tag: 'users' })).toBe('/users');
  });

  it('prints /users/:id', () => {
    expect(router.print({ tag: 'user', id: '123' })).toBe('/users/123');
  });

  it('prints /users/:id/settings', () => {
    expect(router.print({ tag: 'user-settings', id: '123' })).toBe('/users/123/settings');
  });

  it('prints /orgs/:orgId/projects', () => {
    expect(router.print({ tag: 'org', orgId: 'acme' })).toBe('/orgs/acme/projects');
  });

  it('prints /orgs/:orgId/projects/:projectId/issues', () => {
    expect(router.print({ tag: 'project', orgId: 'acme', projectId: 42, page: 1 })).toBe(
      '/orgs/acme/projects/42/issues',
    );
  });

  it('prints /orgs/:orgId/projects/:projectId/settings/members', () => {
    expect(router.print({ tag: 'project-members', orgId: 'acme', projectId: 42 })).toBe(
      '/orgs/acme/projects/42/settings/members',
    );
  });
});

// ── parse → print roundtrip ───────────────────────────────────────────────────

describe('roundtrip', () => {
  const paths = [
    '/users',
    '/users/123',
    '/users/123/settings',
    '/orgs/acme/projects',
    '/orgs/acme/projects/42/issues',
    '/orgs/acme/projects/42/issues/7',
    '/orgs/acme/projects/42/settings',
    '/orgs/acme/projects/42/settings/members',
  ];

  for (const path of paths) {
    it(`parse then print: ${path}`, () => {
      const result = router.parse(url(path));
      expect(result.isSuccess()).toBe(true);
      const parsed = unwrap(result);
      expect(router.print(parsed)).toBe(path);
    });
  }
});
