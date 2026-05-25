import { decodeJwt } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createSessionToken, verifySessionToken } from './session.js';

const testSecret = 'test-secret-that-is-at-least-32-chars!!';

const mockSession = {
  sub: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
};

// ── createSessionToken ────────────────────────────────────────────────────────

describe('createSessionToken', () => {
  it('creates a valid JWT token', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('throws when secret is undefined', async () => {
    await expect(createSessionToken(undefined, mockSession)).rejects.toThrow();
  });

  it('includes sub in token payload', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    const payload = decodeJwt(token);
    expect(payload.sub).toBe(mockSession.sub);
  });

  it('includes name in token payload', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    const payload = decodeJwt(token);
    expect(payload['name']).toBe(mockSession.name);
  });

  it('includes email in token payload', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    const payload = decodeJwt(token);
    expect(payload['email']).toBe(mockSession.email);
  });

  it('sets expiry to 8 hours', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await createSessionToken(testSecret, mockSession);
    const after = Math.floor(Date.now() / 1000);
    const payload = decodeJwt(token);
    const eightHours = 8 * 60 * 60;
    expect(payload.exp).toBeGreaterThanOrEqual(before + eightHours);
    expect(payload.exp).toBeLessThanOrEqual(after + eightHours + 1);
  });
});

// ── verifySessionToken ────────────────────────────────────────────────────────

describe('verifySessionToken', () => {
  it('returns session for valid token', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    const result = await verifySessionToken(testSecret, token);
    expect(result).toEqual(mockSession);
  });

  it('returns null for invalid token', async () => {
    const result = await verifySessionToken('not-a-token', testSecret);
    expect(result).toBeNull();
  });

  it('returns null for expired token', async () => {
    vi.useFakeTimers();
    const token = await createSessionToken(testSecret, mockSession);
    vi.advanceTimersByTime(9 * 60 * 60 * 1000); // advance 9 hours past 8h expiry
    const result = await verifySessionToken(testSecret, token);
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('returns null for token signed with wrong secret', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    const result = await verifySessionToken(token, 'wrong-secret-that-is-at-least-32-chars!!');
    expect(result).toBeNull();
  });

  it('returns null when secret is undefined', async () => {
    const token = await createSessionToken(testSecret, mockSession);
    const result = await verifySessionToken(undefined, token);
    expect(result).toBeNull();
  });

  it('returns null for malformed token', async () => {
    const result = await verifySessionToken(testSecret, 'abc.def');
    expect(result).toBeNull();
  });
});
