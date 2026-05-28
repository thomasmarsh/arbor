/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { defineRoutes, section, type InferContext } from './define-routes.js';
import {
  generateSpec,
  openApiRoute,
  type OpenApiContext,
  type OpenApiMeta,
} from './openapi-context.js';
import { createServer } from './server.js';

describe('OpenApiContext', () => {
  it('extends HttpContext with meta', () => {
    type Ctx = OpenApiContext<'GET', never, { 200: { id: string } }>;

    expectTypeOf<Ctx['method']>().toEqualTypeOf<'GET'>();
    expectTypeOf<Ctx['body']>().toEqualTypeOf<never>();
    expectTypeOf<Ctx['response']>().toEqualTypeOf<{ 200: { id: string } }>();
    expectTypeOf<Ctx['meta']>().toEqualTypeOf<OpenApiMeta>();
    expect(true).toBe(true);
  });
});

describe('openApiRoute', () => {
  const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
  const UserResp = z.object({ id: z.string(), email: z.string() });

  it('creates a RouteNode with OpenApiContext', () => {
    const r = openApiRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp },
      meta: { summary: 'Get a user' },
    });

    expect(r.path).toBe('users/:id/');
    expect(r.context).toBeDefined();
    expect((r.context as any).method).toBe('GET');
    expect((r.context as any).meta).toEqual({ summary: 'Get a user' });
    expect((r.context as any).responseSchemas).toBeDefined();
  });

  it('infers OpenApiContext with meta field', () => {
    const r = openApiRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp },
      meta: { summary: 'Get a user' },
    });
    expect(r.context).toBeDefined();

    type Ctx = InferContext<typeof r>;
    expectTypeOf<Ctx['method']>().toEqualTypeOf<'GET'>();
    expectTypeOf<Ctx['response']>().toEqualTypeOf<{ 200: { id: string; email: string } }>();
    expectTypeOf<Ctx['meta']>().toEqualTypeOf<OpenApiMeta>();
  });

  it('works without meta', () => {
    const r = openApiRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp },
    });

    expect((r.context as any).meta).toBeUndefined();
    expect(r.path).toBe('users/:id/');
  });

  it('is compatible with createServer', () => {
    const router = defineRoutes([
      openApiRoute(GetUser, 'GET', 'users/:id/', {
        response: { 200: UserResp },
        meta: { summary: 'Get a user' },
      }),
    ]);

    const server = createServer(router, {
      'get-user': (route) => {
        return Promise.resolve({ status: 200 as const, body: { id: route.id, email: 'test@test.com' } });
      },
    });

    expect(typeof server.handle).toBe('function');
  });
});

describe('generateSpec', () => {
  const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
  const CreateUser = z.object({ tag: z.literal('create-user') });
  const UserResp = z.object({ id: z.string(), email: z.string() });
  const ErrorResp = z.object({ error: z.string() });
  const CreateBody = z.object({ name: z.string(), email: z.string() });

  const router = defineRoutes([
    openApiRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp, 404: ErrorResp },
      meta: { summary: 'Get user by ID', tags: ['users'] },
    }),
    openApiRoute(CreateUser, 'POST', 'users/', {
      body: CreateBody,
      response: { 201: UserResp },
      meta: { summary: 'Create a new user', tags: ['users'] },
    }),
  ]);

  const spec = generateSpec(router, { title: 'Test API', version: '1.0.0' });

  it('has correct top-level structure', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toEqual({ title: 'Test API', version: '1.0.0' });
    expect(spec.paths).toBeDefined();
  });

  it('generates correct paths', () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(Object.keys(paths)).toContain('/users/{id}');
    expect(Object.keys(paths)).toContain('/users');
  });

  describe('GET /users/{id}', () => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const op = paths['/users/{id}']!.get!;

    it('has correct operationId', () => {
      expect(op.operationId).toBe('get-user');
    });

    it('has summary and tags from meta', () => {
      expect(op.summary).toBe('Get user by ID');
      expect(op.tags).toEqual(['users']);
    });

    it('has path parameter', () => {
      const params = op.parameters as Record<string, unknown>[];
      const idParam = params.find((p) => p.name === 'id');
      expect(idParam).toEqual({
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    });

    it('has response schemas', () => {
      const responses = op.responses as Record<string, Record<string, unknown>>;
      expect(responses['200']).toBeDefined();
      expect(responses['404']).toBeDefined();

      const ok = responses['200']!.content as Record<string, Record<string, unknown>>;
      const schema = ok['application/json']!.schema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(schema.properties).toEqual({
        id: { type: 'string' },
        email: { type: 'string' },
      });
    });
  });

  describe('POST /users', () => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const op = paths['/users']!.post!;

    it('has correct operationId', () => {
      expect(op.operationId).toBe('create-user');
    });

    it('has request body schema', () => {
      const reqBody = op.requestBody as Record<string, unknown>;
      expect(reqBody.required).toBe(true);
      const content = reqBody.content as Record<string, Record<string, unknown>>;
      const schema = content['application/json']!.schema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(schema.properties).toEqual({
        name: { type: 'string' },
        email: { type: 'string' },
      });
    });

    it('has response schema', () => {
      const responses = op.responses as Record<string, Record<string, unknown>>;
      expect(responses['201']).toBeDefined();
    });
  });

  describe('nested routes with sections', () => {
    const ListProjects = z.object({ tag: z.literal('list-projects') });
    const GetProject = z.object({ tag: z.literal('get-project'), projectId: z.number() });
    const ProjectResp = z.object({ id: z.number(), name: z.string() });

    const nestedRouter = defineRoutes([
      section('orgs/:orgId/', [
        openApiRoute(ListProjects, 'GET', 'projects/', {
          response: { 200: ProjectResp },
          meta: { summary: 'List projects' },
        }),
        openApiRoute(GetProject, 'GET', 'projects/#projectId/', {
          response: { 200: ProjectResp },
          meta: { summary: 'Get project' },
        }),
      ]),
    ]);

    const nestedSpec = generateSpec(nestedRouter, { title: 'Nested API', version: '1.0.0' });

    it('accumulates path segments through sections', () => {
      const paths = nestedSpec.paths as Record<string, unknown>;
      expect(Object.keys(paths)).toContain('/orgs/{orgId}/projects');
      expect(Object.keys(paths)).toContain('/orgs/{orgId}/projects/{projectId}');
    });

    it('includes section path params', () => {
      const paths = nestedSpec.paths as Record<string, Record<string, Record<string, unknown>>>;
      const op = paths['/orgs/{orgId}/projects']!.get!;
      const params = op.parameters as Record<string, unknown>[];
      const orgParam = params.find((p) => p.name === 'orgId');
      expect(orgParam).toEqual({
        name: 'orgId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    });
  });

  describe('operationId override', () => {
    it('uses meta.operationId over tag when provided', () => {
      const r = defineRoutes([
        openApiRoute(GetUser, 'GET', 'users/:id/', {
          response: { 200: UserResp },
          meta: { operationId: 'fetchUser' },
        }),
      ]);

      const s = generateSpec(r, { title: 'Test', version: '1.0.0' });
      const paths = s.paths as Record<string, Record<string, Record<string, unknown>>>;
      expect(paths['/users/{id}']!.get!.operationId).toBe('fetchUser');
    });
  });
});
