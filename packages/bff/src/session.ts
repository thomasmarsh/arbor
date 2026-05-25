import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { env } from './env.js';

// ── Session schema ────────────────────────────────────────────────────────────

export const SessionSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

// ── Cookie name ───────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'arbo_session';

// ── Secret ───────────────────────────────────────────────────────────────────

function secret(): Uint8Array {
  if (env.ARBO_SESSION_SECRET == null) {
    throw new Error('ARBO_SESSION_SECRET is not set');
  }
  return new TextEncoder().encode(env.ARBO_SESSION_SECRET);
}

// ── Token creation ────────────────────────────────────────────────────────────

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
}

// ── Token verification ────────────────────────────────────────────────────────

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return SessionSchema.parse(payload);
  } catch {
    return null;
  }
}
