import { describe, expect, it } from 'vitest';
import { ProcessEnvSchema } from './env.js';

const validDisabledEnv = {
  ARBO_AUTH_DISABLED: 'true',
  NODE_ENV: 'test',
};

const validEnabledEnv = {
  ARBO_AUTH_DISABLED: 'false',
  ARBO_OIDC_ISSUER: 'https://idp.example.com',
  ARBO_OIDC_CLIENT_ID: 'client-id',
  ARBO_OIDC_CLIENT_SECRET: 'client-secret',
  ARBO_OIDC_REDIRECT_URI: 'https://app.example.com/auth/callback',
  ARBO_SESSION_SECRET: 'test-secret-that-is-at-least-32-chars!!',
  NODE_ENV: 'test',
};

describe('EnvSchema', () => {
  it('parses valid env with auth disabled', () => {
    expect(() => ProcessEnvSchema.parse(validDisabledEnv)).not.toThrow();
  });

  it('parses valid env with auth enabled and all OIDC vars present', () => {
    expect(() => ProcessEnvSchema.parse(validEnabledEnv)).not.toThrow();
  });

  it('fails when auth enabled and ARBO_OIDC_ISSUER missing', () => {
    const { ARBO_OIDC_ISSUER: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBO_OIDC_CLIENT_ID missing', () => {
    const { ARBO_OIDC_CLIENT_ID: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBO_OIDC_CLIENT_SECRET missing', () => {
    const { ARBO_OIDC_CLIENT_SECRET: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBO_OIDC_REDIRECT_URI missing', () => {
    const { ARBO_OIDC_REDIRECT_URI: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBO_SESSION_SECRET missing', () => {
    const { ARBO_SESSION_SECRET: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when ARBO_SESSION_SECRET is less than 32 chars', () => {
    expect(() =>
      ProcessEnvSchema.parse({
        ...validEnabledEnv,
        ARBO_SESSION_SECRET: 'too-short',
      }),
    ).toThrow();
  });

  it('defaults ARBO_AUTH_DISABLED to false', () => {
    const { ARBO_AUTH_DISABLED: _, ...envWithoutAuthDisabled } = validEnabledEnv;
    const result = ProcessEnvSchema.parse(envWithoutAuthDisabled);
    expect(result.ARBO_AUTH_DISABLED).toBe(false);
  });

  it('defaults PORT to 3000', () => {
    const result = ProcessEnvSchema.parse(validDisabledEnv);
    expect(result.BFF_PORT).toBe(3000);
  });

  it('defaults ARBO_API_URL to http://localhost:3001', () => {
    const result = ProcessEnvSchema.parse(validDisabledEnv);
    expect(result.ARBO_API_URL).toBe('http://localhost:3001');
  });

  it('transforms ARBO_AUTH_DISABLED string to boolean', () => {
    const resultTrue = ProcessEnvSchema.parse({ ...validDisabledEnv, ARBO_AUTH_DISABLED: 'true' });
    const resultFalse = ProcessEnvSchema.parse({ ...validEnabledEnv, ARBO_AUTH_DISABLED: 'false' });
    expect(resultTrue.ARBO_AUTH_DISABLED).toBe(true);
    expect(resultFalse.ARBO_AUTH_DISABLED).toBe(false);
  });
});
