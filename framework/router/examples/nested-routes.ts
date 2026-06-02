// Multi-level route tree: parse produces nested objects; print() reconstructs URLs.
import z from 'zod';
import { defineRoutes, route } from '../src/index.js';

const Users = z.object({ tag: z.literal('users') });
const User = z.object({ tag: z.literal('user'), id: z.string() });
const Settings = z.object({ tag: z.literal('settings') });

const router = defineRoutes([
  route(Users, 'users', [
    route(User, ':id', [
      route(Settings, 'settings'),
    ]),
  ]),
]);

const url = (path: string) => new URL(`http://localhost${path}`);

// Parsed routes are nested discriminated unions
console.log(router.parse(url('/users')).getOrThrow());
// { tag: 'users' }

console.log(router.parse(url('/users/42')).getOrThrow());
// { tag: 'users', child: { tag: 'user', id: '42' } }

console.log(router.parse(url('/users/42/settings')).getOrThrow());
// { tag: 'users', child: { tag: 'user', id: '42', child: { tag: 'settings' } } }

// print() reconstructs the URL from the parsed route object — fully round-trips
console.log(router.print({ tag: 'users' }));
// /users

console.log(router.print({ tag: 'users', child: { tag: 'user', id: '42' } }));
// /users/42

console.log(router.print({ tag: 'users', child: { tag: 'user', id: '42', child: { tag: 'settings' } } }));
// /users/42/settings
