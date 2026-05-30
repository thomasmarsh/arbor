/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { RouteNode } from './route-node.js';
import { parseSegments } from './segments.js';
import {
  type ParseDiag,
  type WalkNode,
  buildUrl,
  forEachTaggedNode,
  resolveQuerySchema,
  validateSchema,
  walkParse,
  walkPrint,
} from './walk.js';

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

  const nodes: RouteNode<unknown, RouteNode<unknown, any, any, any>[], any>[] = [
    {
      _type: undefined,
      schema: Users,
      path: 'users/',
      segments: parseSegments('users/'),
      children: [
        {
          _type: undefined,

          schema: User,
          path: ':id/',
          segments: parseSegments(':id/'),
          children: [
            {
              _type: undefined,

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
      schema: Org,
      path: 'orgs/:orgId/',
      segments: parseSegments('orgs/:orgId/'),
      children: [
        {
          _type: undefined,

          schema: Project,
          path: '#projectId/',
          segments: parseSegments('#projectId/'),
          children: [
            {
              _type: undefined,

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

  describe('explicit querySchema', () => {
    const SearchSchema = z.object({ tag: z.literal('search') });
    const QuerySchema = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().optional(),
    });

    const searchNodes: RouteNode<unknown, RouteNode<unknown, any, any, any>[], any>[] = [
      {
        _type: undefined,
        schema: SearchSchema,
        path: 'search/',
        segments: parseSegments('search/'),
        children: [],
        _meta: { querySchema: QuerySchema },
      },
    ];

    it('returns query sub-object with coerced values', () => {
      expect(walkParse(searchNodes, ['search'], q('page=3'), {})).toEqual({
        tag: 'search',
        query: { page: 3 },
      });
    });

    it('applies query schema defaults', () => {
      expect(walkParse(searchNodes, ['search'], q(), {})).toEqual({
        tag: 'search',
        query: { page: 1 },
      });
    });

    it('includes optional query field when provided', () => {
      expect(walkParse(searchNodes, ['search'], q('limit=20'), {})).toEqual({
        tag: 'search',
        query: { page: 1, limit: 20 },
      });
    });

    it('returns null when query schema validation fails', () => {
      expect(walkParse(searchNodes, ['search'], q('page=abc'), {})).toBeNull();
    });

    it('does not mix query params into main schema result', () => {
      const result = walkParse(searchNodes, ['search'], q('page=2'), {});
      expect(result).not.toBeNull();
      expect(Object.keys(result!)).not.toContain('page');
    });
  });

  describe('section nodes', () => {
    const sectionNodes: RouteNode<
      unknown,
      RouteNode<unknown, any, any, any>[],
      any
    >[] = [
      {
        _type: undefined,

        schema: null,
        path: 'orgs/:orgId/',
        segments: parseSegments('orgs/:orgId/'),
        children: [
          {
            _type: undefined,

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

  describe('nested sections (section > section > route)', () => {
    const nestedSectionNodes: RouteNode<
      unknown,
      RouteNode<unknown, any, any, any>[],
      any
    >[] = [
      {
        _type: undefined,

        schema: null,
        path: 'orgs/:orgId/',
        segments: parseSegments('orgs/:orgId/'),
        children: [
          {
            _type: undefined,

            schema: null,
            path: 'projects/',
            segments: parseSegments('projects/'),
            children: [
              {
                _type: undefined,

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

    it('parses through two nested sections', () => {
      expect(
        walkParse(nestedSectionNodes, ['orgs', 'acme', 'projects', '7'], q(), {}),
      ).toMatchObject({
        child: { child: { tag: 'issue', issueId: '7' } },
      });
    });

    it('inner section alone is not a valid terminal route', () => {
      expect(walkParse(nestedSectionNodes, ['orgs', 'acme', 'projects'], q(), {})).toBeNull();
    });

    it('outer section alone is not a valid terminal route', () => {
      expect(walkParse(nestedSectionNodes, ['orgs', 'acme'], q(), {})).toBeNull();
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

  describe('diagnostics accumulator', () => {
    it('is absent by default and does not affect parse result', () => {
      expect(walkParse(nodes, ['users'], q(), {})).toEqual({ tag: 'users' });
    });

    it('pushes segment-mismatch for each non-matching top-level node', () => {
      const diag: ParseDiag[] = [];
      walkParse(nodes, ['unknown'], q(), {}, diag);
      expect(diag).toContainEqual({
        kind: 'segment-mismatch',
        path: 'users/',
        urlSegments: ['unknown'],
      });
      expect(diag).toContainEqual({
        kind: 'segment-mismatch',
        path: 'orgs/:orgId/',
        urlSegments: ['unknown'],
      });
    });

    it('pushes schema-error when schema validation fails', () => {
      const diag: ParseDiag[] = [];
      walkParse(nodes, ['orgs', 'acme', '42', '7'], q('status=invalid'), {}, diag);
      const schemaErrors = diag.filter((d): d is Extract<ParseDiag, { kind: 'schema-error' }> => d.kind === 'schema-error');
      expect(schemaErrors).toHaveLength(1);
      const first = schemaErrors[0]!;
      expect(first).toMatchObject({ kind: 'schema-error', path: ':issueId/' });
      expect(first.issues.length).toBeGreaterThan(0);
    });

    it('is empty when parse succeeds', () => {
      const diag: ParseDiag[] = [];
      walkParse(nodes, ['users'], q(), {}, diag);
      expect(diag).toHaveLength(0);
    });

    it('does not push segment-mismatch for section nodes (schema === null)', () => {
      const sectionOnlyNodes: RouteNode<unknown, RouteNode<unknown, any, any, any>[], any>[] = [
        {
          _type: undefined,
          schema: null,
          path: 'orgs/:orgId/',
          segments: parseSegments('orgs/:orgId/'),
          children: [],
        },
      ];
      const diag: ParseDiag[] = [];
      walkParse(sectionOnlyNodes, ['users'], q(), {}, diag);
      expect(diag).toHaveLength(0);
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

  const nodes: RouteNode<unknown, RouteNode<unknown, any, any, any>[], any>[] = [
    {
      _type: undefined,
      schema: Users,
      path: 'users/',
      segments: parseSegments('users/'),
      children: [
        {
          _type: undefined,

          schema: User,
          path: ':id/',
          segments: parseSegments(':id/'),
          children: [
            {
              _type: undefined,

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
      schema: Org,
      path: 'orgs/:orgId/',
      segments: parseSegments('orgs/:orgId/'),
      children: [
        {
          _type: undefined,

          schema: Project,
          path: '#projectId/',
          segments: parseSegments('#projectId/'),
          children: [
            {
              _type: undefined,

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

  describe('explicit query sub-object in buildUrl', () => {
    it('serializes query sub-object keys as URL query params', () => {
      const result = { segments: [{ kind: 'lit' as const, value: 'items' }], paramNames: new Set<string>() };
      const route = { tag: 'search', query: { page: 3, limit: 20 } };
      const url = buildUrl(result, route);
      expect(url).toContain('/items');
      expect(url).toContain('page=3');
      expect(url).toContain('limit=20');
    });

    it('omits undefined values from query sub-object', () => {
      const result = { segments: [{ kind: 'lit' as const, value: 'items' }], paramNames: new Set<string>() };
      const route = { tag: 'search', query: { page: 1, limit: undefined } };
      const url = buildUrl(result, route);
      expect(url).toContain('page=1');
      expect(url).not.toContain('limit');
    });

    it('does not serialize query key itself as a param', () => {
      const result = { segments: [{ kind: 'lit' as const, value: 'items' }], paramNames: new Set<string>() };
      const route = { tag: 'search', query: { page: 3 } };
      expect(buildUrl(result, route)).not.toContain('query=');
    });

    it('mixes top-level and query sub-object params', () => {
      const result = { segments: [{ kind: 'lit' as const, value: 'items' }], paramNames: new Set<string>() };
      const route = { tag: 'search', sort: 'asc', query: { page: 2 } };
      const url = buildUrl(result, route);
      expect(url).toContain('sort=asc');
      expect(url).toContain('page=2');
    });
  });

  describe('section nodes', () => {
    const sectionNodes: RouteNode<
      unknown,
      RouteNode<unknown, any, any, any>[],
      any
    >[] = [
      {
        _type: undefined,

        schema: null,
        path: 'orgs/:orgId/',
        segments: parseSegments('orgs/:orgId/'),
        children: [
          {
            _type: undefined,

            schema: Project,
            path: '#projectId/',
            segments: parseSegments('#projectId/'),
            children: [],
          },
        ],
      },
    ];

    it('prints through a single section', () => {
      const route = { child: { tag: 'project', projectId: 42, orgId: 'acme' } };
      const result = walkPrint(sectionNodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme/42');
    });
  });

  describe('nested sections (section > section > route)', () => {
    const nestedSectionNodes: RouteNode<
      unknown,
      RouteNode<unknown, any, any, any>[],
      any
    >[] = [
      {
        _type: undefined,

        schema: null,
        path: 'orgs/:orgId/',
        segments: parseSegments('orgs/:orgId/'),
        children: [
          {
            _type: undefined,

            schema: null,
            path: 'projects/',
            segments: parseSegments('projects/'),
            children: [
              {
                _type: undefined,

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

    it('prints through two nested sections', () => {
      const route = { child: { child: { tag: 'issue', issueId: '7', orgId: 'acme' } } };
      const result = walkPrint(nestedSectionNodes, route, empty);
      expect(result).not.toBeNull();
      expect(buildUrl(result!, route)).toBe('/orgs/acme/projects/7');
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

describe('validateSchema', () => {
  const Schema = z.object({ tag: z.literal('users'), id: z.string() });

  it('returns parsed data on success', () => {
    expect(validateSchema(Schema, { tag: 'users', id: '1' }, 'users/')).toEqual({ tag: 'users', id: '1' });
  });

  it('returns undefined on failure', () => {
    expect(validateSchema(Schema, { tag: 'wrong' }, 'users/')).toBeUndefined();
  });

  it('pushes schema-error diagnostic on failure', () => {
    const diag: ParseDiag[] = [];
    validateSchema(Schema, { tag: 'wrong' }, 'users/', diag);
    expect(diag).toHaveLength(1);
    expect(diag[0]).toMatchObject({ kind: 'schema-error', path: 'users/' });
  });

  it('does not push to diag on success', () => {
    const diag: ParseDiag[] = [];
    validateSchema(Schema, { tag: 'users', id: '1' }, 'users/', diag);
    expect(diag).toHaveLength(0);
  });
});

describe('resolveQuerySchema', () => {
  const QuerySchema = z.object({ page: z.coerce.number().default(1) });

  it('returns querySchema from _meta when present', () => {
    const node: WalkNode = {
      _type: undefined,
      schema: z.object({ tag: z.literal('search') }),
      path: 'search/',
      segments: [],
      children: [],
      _meta: { querySchema: QuerySchema },
    };
    expect(resolveQuerySchema(node)).toBe(QuerySchema);
  });

  it('returns undefined when _meta has no querySchema', () => {
    const node: WalkNode = {
      _type: undefined,
      schema: z.object({ tag: z.literal('users') }),
      path: 'users/',
      segments: [],
      children: [],
    };
    expect(resolveQuerySchema(node)).toBeUndefined();
  });
});

describe('forEachTaggedNode', () => {
  const Users = z.object({ tag: z.literal('users') });
  const User = z.object({ tag: z.literal('user'), id: z.string() });

  const nodes: WalkNode[] = [
    {
      _type: undefined,
      schema: Users,
      path: 'users/',
      segments: [],
      children: [
        {
          _type: undefined,
          schema: User,
          path: ':id/',
          segments: [],
          children: [],
        },
      ],
    },
    {
      _type: undefined,
      schema: null,
      path: 'section/',
      segments: [],
      children: [],
    },
  ];

  it('visits all nodes with a schema and tag, including nested', () => {
    const tags: string[] = [];
    forEachTaggedNode(nodes, (_, tag) => tags.push(tag));
    expect(tags).toEqual(['users', 'user']);
  });

  it('skips schema-null nodes', () => {
    const visited: WalkNode[] = [];
    forEachTaggedNode(nodes, (node) => visited.push(node));
    expect(visited.every((n) => n.schema !== null)).toBe(true);
  });
});
