import type { Result } from '@arbo/common';
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export interface UserRepository {
  findById: (id: string) => Promise<Result<User, string>>;
  findAll: () => Promise<Result<User[], string>>;
  create: (email: string) => Promise<Result<User, string>>;
}
