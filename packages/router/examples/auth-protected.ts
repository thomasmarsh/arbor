// withSession guard: enforce authentication and inject a typed session into ctx.
import { withGuard, withSession } from '../src/index.js';

interface UserSession {
  userId: string;
  role: 'admin' | 'user';
}

interface Ctx {
  req: Request;
}

// resolveSession is user-supplied — callers own the JWT verification logic.
const myWithSession = withSession<Ctx, UserSession>(async (ctx) => {
  const auth = ctx.req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  // Real app: verify the JWT signature and decode claims here.
  if (token === 'valid-token') return { userId: 'user-123', role: 'admin' };
  return null;
});

// Handlers wrapped with withGuard(myWithSession, ...) get `session` in ctx.
// Without the guard, `session` does not exist — enforced at compile time.
const meHandler = withGuard(myWithSession, async ({ session }) =>
  new Response(JSON.stringify({ id: session.userId, role: session.role }), {
    headers: { 'content-type': 'application/json' },
  }),
);

const authed = await meHandler({
  req: new Request('http://localhost/me', {
    headers: { authorization: 'Bearer valid-token' },
  }),
});
console.log('authed status:', authed.status);     // 200
console.log('authed body:', await authed.json()); // { id: 'user-123', role: 'admin' }

const unauthed = await meHandler({ req: new Request('http://localhost/me') });
console.log('unauthed status:', unauthed.status); // 401
