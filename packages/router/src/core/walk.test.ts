/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { RouteNode } from './route-node.js';
import { parseSegments } from './segments.js';
import { buildUrl, walkParse, walkPrint } from './walk.js';

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

  const nodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[] = [
    {
      _type: undefined,
      _child: undefined,

      schema: Users,
      path: 'users/',
      segments: parseSegments('users/'),
      children: [
        {
          _type: undefined,
          _child: undefined,

          schema: User,
          path: ':id/',
          segments: parseSegments(':id/'),
          children: [
            {
              _type: undefined,
              _child: undefined,

              schema: Settings,
              path: 'settings/',
              segments: parseSegments('settings/'),
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
      segments: parseSegments('orgs/:orgId/'),
      children: [
        {
          _type: undefined,
          _child: undefined,

          schema: Project,
          path: '#projectId/',
          segments: parseSegments('#projectId/'),
          children: [
            {
              _type: undefined,
              _child: undefined,

              schema: Issue,
              path: ':issueId/',
              segments: parseSegments(':issueId/'),
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
    const sectionNodes: RouteNode<
      unknown,
      unknown,
      RouteNode<unknown, unknown, any, any>[],
      any
    >[] = [
      {
        _type: undefined,
        _child: undefined,

        schema: null,
        path: 'orgs/:orgId/',
        segments: parseSegments('orgs/:orgId/'),
        children: [
          {
            _type: undefined,
            _child: undefined,

            schema: Project,
            path: '#projectId/',
            segments: parseSegments('#projectId/'),
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

  const nodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[] = [
    {
      _type: undefined,
      _child: undefined,

      schema: Users,
      path: 'users/',
      segments: parseSegments('users/'),
      children: [
        {
          _type: undefined,
          _child: undefined,

          schema: User,
          path: ':id/',
          segments: parseSegments(':id/'),
          children: [
            {
              _type: undefined,
              _child: undefined,

              schema: Settings,
              path: 'settings/',
              segments: parseSegments('settings/'),
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
      segments: parseSegments('orgs/:orgId/'),
      children: [
        {
          _type: undefined,
          _child: undefined,

          schema: Project,
          path: '#projectId/',
          segments: parseSegments('#projectId/'),
          children: [
            {
              _type: undefined,
              _child: undefined,

              schema: Issue,
              path: ':issueId/',
              segments: parseSegments(':issueId/'),
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
          child: { tag: 'issue', issueId: '7' },
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
          child: { tag: 'issue', issueId: '7', status: 'open' },
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

  describe('encoding', () => {
    it('encodes spaces in path params', () => {
      const r = { tag: 'users', child: { tag: 'user', id: 'hello world' } };
      const result = walkPrint(nodes, r, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, r)).toBe('/users/hello%20world');
    });

    it('encodes slashes in path params', () => {
      const r = { tag: 'users', child: { tag: 'user', id: 'a/b' } };
      const result = walkPrint(nodes, r, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, r)).toBe('/users/a%2Fb');
    });

    it('encodes unicode in path params', () => {
      const r = { tag: 'users', child: { tag: 'user', id: '日本語' } };
      const result = walkPrint(nodes, r, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, r)).toBe('/users/%E6%97%A5%E6%9C%AC%E8%AA%9E');
    });
  });
});
