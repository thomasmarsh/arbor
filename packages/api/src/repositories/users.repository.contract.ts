import { beforeEach, describe, expect, it } from 'vitest';
import type { UserRepository } from './users.repository.js';

// This specification is a contract for both the postgres and oracle world
export const userRepositorySpec = (getRepo: () => UserRepository) => {
  describe('UserRepository contract', () => {
    let repo: UserRepository;

    beforeEach(() => {
      repo = getRepo();
    });

    it('findById returns failure for unknown id', async () => {
      const result = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(result.isFailure()).toBe(true);
    });

    it('create persists and returns user', async () => {
      const result = await repo.create('test@example.com');
      expect(result.isSuccess()).toBe(true);
      result.fold(
        (user) => {
          expect(user.email).toBe('test@example.com');
        },
        () => {
          throw new Error('expected success');
        },
      );
    });

    it('findById returns user after create', async () => {
      const created = await repo.create('findme@example.com');
      const id = created.getOrElse(null as never).id;
      const found = await repo.findById(id);
      expect(found.isSuccess()).toBe(true);
    });

    it('findAll returns created users', async () => {
      await repo.create('all1@example.com');
      await repo.create('all2@example.com');
      const result = await repo.findAll();
      result.fold(
        (users) => {
          expect(users.length).toBeGreaterThanOrEqual(2);
        },
        () => {
          throw new Error('expected success');
        },
      );
    });
  });
};
