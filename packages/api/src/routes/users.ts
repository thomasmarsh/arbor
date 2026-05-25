import type { Result } from '@arbo/common';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { ApiEnv } from '../env.js';

export const respond = <T>(
  c: Context,
  result: Result<T, string>,
  status: ContentfulStatusCode = 200,
) =>
  result.fold(
    (value) => c.json(value, status),
    (err) => c.json({ error: err }, err === 'not_found' ? 404 : 500) as unknown as Response,
  );

const users = new Hono<{ Variables: { env: ApiEnv } }>();

const CreateUserSchema = z.object({
  email: z.email(),
});

users.get('/', async (c) => {
  const result = await c.get('env').db.users.findAll();
  return respond(c, result);
});

users.get('/:id', async (c) => {
  const result = await c.get('env').db.users.findById(c.req.param('id'));
  return respond(c, result);
});

users.post('/', async (c) => {
  const parsed = CreateUserSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: z.flattenError(parsed.error).fieldErrors }, 400);
  const result = await c.get('env').db.users.create(parsed.data.email);
  return respond(c, result, 201);
});

export { users };
