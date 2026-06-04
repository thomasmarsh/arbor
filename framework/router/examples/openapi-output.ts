// Generate an OpenAPI 3.1 spec from the router — pipe to `jq` for pretty printing.
import z from 'zod';
import { defineRoutes, generateSpec, httpRoute, literal, object, string } from '../src/index.js';

const GetUser = object({ tag: literal('get-user'), id: string() });
const CreateUser = object({ tag: literal('create-user') });
const CreateUserBody = z.object({ name: z.string(), email: z.string() });
const UserResp = z.object({ id: z.string(), name: z.string(), email: z.string() });
const ErrorResp = z.object({ error: z.string() });

const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserResp, 404: ErrorResp },
  }),
  httpRoute(CreateUser, 'POST', 'users', {
    body: CreateUserBody,
    response: { 201: UserResp },
  }),
]);

const spec = generateSpec(router, { title: 'User API', version: '1.0.0' });
console.log(JSON.stringify(spec, null, 2));
