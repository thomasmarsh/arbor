import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

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

function secret(sessionSecret: string | undefined): Uint8Array {
  if (sessionSecret == null) {
    throw new Error('ARBO_SESSION_SECRET is not set');
  }
  return new TextEncoder().encode(sessionSecret);
}

// ── Token creation ────────────────────────────────────────────────────────────

export async function createSessionToken(
  sessionSecret: string | undefined,
  session: Session,
): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret(sessionSecret));
}

// ── Token verification ────────────────────────────────────────────────────────

export async function verifySessionToken(
  sessionSecret: string | undefined,
  token: string,
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(sessionSecret));
    return SessionSchema.parse(payload);
  } catch {
    return null;
  }
}
