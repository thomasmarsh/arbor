// withRbac guard: enforce role-based access control on top of withSession.
import { composeGuards, withGuard, withRbac, withSession } from '../src/index.js';

interface UserSession {
  userId: string;
  roles: string[];
}

interface Ctx {
  req: Request;
}

const myWithSession = withSession<Ctx, UserSession>(async (ctx) => {
  const impl = () => {
    const auth = ctx.req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    if (token === 'admin-token') return { userId: 'user-1', roles: ['admin'] };
    if (token === 'user-token') return { userId: 'user-2', roles: ['user'] };
    return null;
  };

  return Promise.resolve(impl());
});

// Compose session + RBAC: only 'admin' or 'super-user' may proceed.
const adminOnly = composeGuards(myWithSession, withRbac(['admin', 'super-user']));

const deleteUserHandler = withGuard(adminOnly, async ({ session }) =>
  Promise.resolve(
    new Response(JSON.stringify({ deleted: true, by: session.userId }), {
      headers: { 'content-type': 'application/json' },
    }),
  ),
);

const make = (token?: string) =>
  new Request('http://localhost/admin/users/42', {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const adminResp = await deleteUserHandler({ req: make('admin-token') });
console.log('admin status:', adminResp.status); // 200
console.log('admin body:', await adminResp.json()); // { deleted: true, by: 'user-1' }

const userResp = await deleteUserHandler({ req: make('user-token') });
console.log('user status:', userResp.status); // 403

const anonResp = await deleteUserHandler({ req: make() });
console.log('anon status:', anonResp.status); // 401
