import { describe, expect, it } from 'vitest';
import z from 'zod';
import { defineRoutes, section } from '../core/define-routes.js';
import { openApiRoute } from '../contexts/openapi-context.js';
import { generateSpec } from './generate-spec.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const CreateUser = z.object({ tag: z.literal('create-user') });
const ListProjects = z.object({ tag: z.literal('list-projects') });
const GetProject = z.object({ tag: z.literal('get-project'), projectId: z.number() });
const UserResp = z.object({ id: z.string(), email: z.string() });
const ErrorResp = z.object({ error: z.string() });
const CreateBody = z.object({ name: z.string(), email: z.string() });
const ProjectResp = z.object({ id: z.number(), name: z.string() });

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

describe('generateSpec snapshot', () => {
  it('matches snapshot for fixture router', () => {
    const spec = generateSpec(router, { title: 'Fixture API', version: '1.0.0' });
    expect(spec).toMatchSnapshot();
  });
});
