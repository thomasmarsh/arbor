import { describe, expect, it } from 'vitest';
import { ProcessEnvSchema } from './env.js';

const validDisabledEnv = {
  ARBOR_AUTH_DISABLED: 'true',
  NODE_ENV: 'test',
};

const validEnabledEnv = {
  ARBOR_AUTH_DISABLED: 'false',
  ARBOR_OIDC_ISSUER: 'https://idp.example.com',
  ARBOR_OIDC_CLIENT_ID: 'client-id',
  ARBOR_OIDC_CLIENT_SECRET: 'client-secret',
  ARBOR_OIDC_REDIRECT_URI: 'https://app.example.com/auth/callback',
  ARBOR_SESSION_SECRET: 'test-secret-that-is-at-least-32-chars!!',
  NODE_ENV: 'test',
};

describe('EnvSchema', () => {
  it('parses valid env with auth disabled', () => {
    expect(() => ProcessEnvSchema.parse(validDisabledEnv)).not.toThrow();
  });

  it('parses valid env with auth enabled and all OIDC vars present', () => {
    expect(() => ProcessEnvSchema.parse(validEnabledEnv)).not.toThrow();
  });

  it('fails when auth enabled and ARBOR_OIDC_ISSUER missing', () => {
    const { ARBOR_OIDC_ISSUER: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBOR_OIDC_CLIENT_ID missing', () => {
    const { ARBOR_OIDC_CLIENT_ID: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBOR_OIDC_CLIENT_SECRET missing', () => {
    const { ARBOR_OIDC_CLIENT_SECRET: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBOR_OIDC_REDIRECT_URI missing', () => {
    const { ARBOR_OIDC_REDIRECT_URI: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when auth enabled and ARBOR_SESSION_SECRET missing', () => {
    const { ARBOR_SESSION_SECRET: _, ...env } = validEnabledEnv;
    expect(() => ProcessEnvSchema.parse(env)).toThrow();
  });

  it('fails when ARBOR_SESSION_SECRET is less than 32 chars', () => {
    expect(() =>
      ProcessEnvSchema.parse({
        ...validEnabledEnv,
        ARBOR_SESSION_SECRET: 'too-short',
      }),
    ).toThrow();
  });

  it('defaults ARBOR_AUTH_DISABLED to false', () => {
    const { ARBOR_AUTH_DISABLED: _, ...envWithoutAuthDisabled } = validEnabledEnv;
    const result = ProcessEnvSchema.parse(envWithoutAuthDisabled);
    expect(result.ARBOR_AUTH_DISABLED).toBe(false);
  });

  it('defaults PORT to 3000', () => {
    const result = ProcessEnvSchema.parse(validDisabledEnv);
    expect(result.BFF_PORT).toBe(3000);
  });

  it('defaults ARBOR_API_URL to http://localhost:3001', () => {
    const result = ProcessEnvSchema.parse(validDisabledEnv);
    expect(result.ARBOR_API_URL).toBe('http://localhost:3001');
  });

  it('transforms ARBOR_AUTH_DISABLED string to boolean', () => {
    const resultTrue = ProcessEnvSchema.parse({ ...validDisabledEnv, ARBOR_AUTH_DISABLED: 'true' });
    const resultFalse = ProcessEnvSchema.parse({
      ...validEnabledEnv,
      ARBOR_AUTH_DISABLED: 'false',
    });
    expect(resultTrue.ARBOR_AUTH_DISABLED).toBe(true);
    expect(resultFalse.ARBOR_AUTH_DISABLED).toBe(false);
  });
});
