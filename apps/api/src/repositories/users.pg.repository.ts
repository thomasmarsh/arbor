import { Result } from '@arbor/common';
import z from 'zod';
import type { Pool } from '../db/pg.js';
import { createUser, findAllUsers, findUserById } from './generated/users.queries.js';
import type { User, UserRepository } from './users.repository.js';

const RowSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  created_at: z.coerce.date(),
});

const toUser = (row: unknown): Result<User, string> => {
  const parsed = RowSchema.safeParse(row);
  if (!parsed.success) return Result.err('parse_error');
  return Result.ok({
    id: parsed.data.id,
    email: parsed.data.email,
    createdAt: parsed.data.created_at.toISOString(),
  });
};

export const pgUsersRepository = (pool: Pool): UserRepository => ({
  findById: async (id) => {
    const rows = await findUserById.run({ id }, pool);
    return rows[0] ? toUser(rows[0]) : Result.err('not_found' as const);
  },

  findAll: async () => {
    const rows = await findAllUsers.run(undefined, pool);
    const results = rows.map((row) => toUser(row));
    return Result.combine(results);
  },

  create: async (email) => {
    const rows = await createUser.run({ email }, pool);
    return rows[0] ? toUser(rows[0]) : Result.err('insert_failed' as const);
  },
});
