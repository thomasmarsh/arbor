import { z } from 'zod';
import { defineRoutes, httpRoute } from '@arbor/router';
import { UserSchema } from '../repositories/users.repository.js';

const ErrorResponse = z.object({ error: z.string() });
const CreateUserBody = z.object({ email: z.email() });

const ListUsers = z.object({ tag: z.literal('users-list') });
const GetUser = z.object({ tag: z.literal('users-get'), id: z.string() });
const CreateUser = z.object({ tag: z.literal('users-create') });

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
