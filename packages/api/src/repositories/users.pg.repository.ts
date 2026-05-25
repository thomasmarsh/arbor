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
  if (!parsed.success) return Result.failure('parse_error');
  return Result.success({
    id: parsed.data.id,
    email: parsed.data.email,
    createdAt: parsed.data.created_at,
  });
};

export const pgUsersRepository = (pool: Pool): UserRepository => ({
  findById: async (id) => {
    const rows = await findUserById.run({ id }, pool);
    return rows[0] ? toUser(rows[0]) : Result.failure('not_found' as const);
  },

  findAll: async () => {
    const rows = await findAllUsers.run(undefined, pool);
    const users: User[] = [];
    for (const row of rows) {
      const result = toUser(row);
      if (result.isFailure()) return result;
      users.push(result.getOrElse(null as never));
    }
    return Result.success(users);
  },

  create: async (email) => {
    const rows = await createUser.run({ email }, pool);
    return rows[0] ? toUser(rows[0]) : Result.failure('insert_failed' as const);
  },
});
