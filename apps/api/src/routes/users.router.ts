import { z } from 'zod';
import { defineRoutes, httpRoute, literal, object, string } from '@arbor/router';
import { UserSchema } from '../repositories/users.repository.js';

const ErrorResponse = z.object({ error: z.string() });
const CreateUserBody = z.object({ email: z.email() });

const ListUsers = object({ tag: literal('users-list') });
const GetUser = object({ tag: literal('users-get'), id: string() });
const CreateUser = object({ tag: literal('users-create') });

export const usersRouter = defineRoutes([
  httpRoute(ListUsers, 'GET', 'api/users', {
    response: { 200: z.array(UserSchema), 500: ErrorResponse },
  }),
  httpRoute(GetUser, 'GET', 'api/users/:id', {
    response: { 200: UserSchema, 404: ErrorResponse, 500: ErrorResponse },
  }),
  httpRoute(CreateUser, 'POST', 'api/users', {
    body: CreateUserBody,
    response: { 201: UserSchema, 500: ErrorResponse },
  }),
]);
