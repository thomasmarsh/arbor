import { describe, expect, it } from 'vitest';
import z from 'zod';
import { defineRoutes, section } from '../core/define-routes.js';
import { openApiRoute } from '../contexts/openapi/openapi-context.js';
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
    expect(spec).toMatchInlineSnapshot(`
      {
        "info": {
          "title": "Fixture API",
          "version": "1.0.0",
        },
        "openapi": "3.1.0",
        "paths": {
          "/orgs/{orgId}/projects": {
            "get": {
              "operationId": "list-projects",
              "parameters": [
                {
                  "in": "path",
                  "name": "orgId",
                  "required": true,
                  "schema": {
                    "type": "string",
                  },
                },
              ],
              "responses": {
                "200": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "additionalProperties": false,
                        "properties": {
                          "id": {
                            "type": "number",
                          },
                          "name": {
                            "type": "string",
                          },
                        },
                        "required": [
                          "id",
                          "name",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Response",
                },
              },
              "summary": "List projects",
            },
          },
          "/orgs/{orgId}/projects/{projectId}": {
            "get": {
              "operationId": "get-project",
              "parameters": [
                {
                  "in": "path",
                  "name": "orgId",
                  "required": true,
                  "schema": {
                    "type": "string",
                  },
                },
                {
                  "in": "path",
                  "name": "projectId",
                  "required": true,
                  "schema": {
                    "type": "integer",
                  },
                },
              ],
              "responses": {
                "200": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "additionalProperties": false,
                        "properties": {
                          "id": {
                            "type": "number",
                          },
                          "name": {
                            "type": "string",
                          },
                        },
                        "required": [
                          "id",
                          "name",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Response",
                },
              },
              "summary": "Get project",
            },
          },
          "/users": {
            "post": {
              "operationId": "create-user",
              "requestBody": {
                "content": {
                  "application/json": {
                    "schema": {
                      "additionalProperties": false,
                      "properties": {
                        "email": {
                          "type": "string",
                        },
                        "name": {
                          "type": "string",
                        },
                      },
                      "required": [
                        "name",
                        "email",
                      ],
                      "type": "object",
                    },
                  },
                },
                "required": true,
              },
              "responses": {
                "201": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "additionalProperties": false,
                        "properties": {
                          "email": {
                            "type": "string",
                          },
                          "id": {
                            "type": "string",
                          },
                        },
                        "required": [
                          "id",
                          "email",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Response",
                },
              },
              "summary": "Create a new user",
              "tags": [
                "users",
              ],
            },
          },
          "/users/{id}": {
            "get": {
              "operationId": "get-user",
              "parameters": [
                {
                  "in": "path",
                  "name": "id",
                  "required": true,
                  "schema": {
                    "type": "string",
                  },
                },
              ],
              "responses": {
                "200": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "additionalProperties": false,
                        "properties": {
                          "email": {
                            "type": "string",
                          },
                          "id": {
                            "type": "string",
                          },
                        },
                        "required": [
                          "id",
                          "email",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Response",
                },
                "404": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "additionalProperties": false,
                        "properties": {
                          "error": {
                            "type": "string",
                          },
                        },
                        "required": [
                          "error",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Response",
                },
              },
              "summary": "Get user by ID",
              "tags": [
                "users",
              ],
            },
          },
        },
      }
    `);
  });
});

describe('discriminated union response', () => {
  it('emits discriminator.propertyName in the response schema', () => {
    const Schema = z.object({ tag: z.literal('get-event'), id: z.string() });
    const EventBody = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('created'), at: z.string() }),
      z.object({ kind: z.literal('deleted'), reason: z.string() }),
    ]);
    const r = defineRoutes([
      openApiRoute(Schema, 'GET', 'events/:id', { response: { 200: EventBody } }),
    ]);
    const spec = generateSpec(r, { title: 'T', version: '1' });
    const schema = (
      (spec['paths'] as Record<string, unknown>)['/events/{id}'] as Record<string, unknown>
    )['get'] as { responses: { 200: { content: { 'application/json': { schema: unknown } } } } };
    expect(schema.responses[200].content['application/json'].schema).toMatchInlineSnapshot(`
      {
        "discriminator": {
          "propertyName": "kind",
        },
        "oneOf": [
          {
            "additionalProperties": false,
            "properties": {
              "at": {
                "type": "string",
              },
              "kind": {
                "const": "created",
                "type": "string",
              },
            },
            "required": [
              "kind",
              "at",
            ],
            "type": "object",
          },
          {
            "additionalProperties": false,
            "properties": {
              "kind": {
                "const": "deleted",
                "type": "string",
              },
              "reason": {
                "type": "string",
              },
            },
            "required": [
              "kind",
              "reason",
            ],
            "type": "object",
          },
        ],
      }
    `);
  });
});
