import { Result } from '@arbo/common';
import z from 'zod';
import type { User, UserRepository } from '../repositories/users.repository.js';

export const getUser = async (id: string, repo: UserRepository): Promise<Result<User, string>> => {
  if (!z.uuid().safeParse(id).success) return Result.failure('invalid_id');
  return repo.findById(id);
};
