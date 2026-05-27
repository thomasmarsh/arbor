import { z } from 'zod';

const UiEnvSchema = z
  .object({
    VITE_AUTH_MODE: z.enum(['mock', 'oidc', 'bff']).default('mock'),
    VITE_OIDC_ISSUER: z.url().optional(),
    VITE_OIDC_CLIENT_ID: z.string().optional(),
    VITE_APP_URL: z.url().default('http://localhost:5173'),
  })
  .refine(
    (e) =>
      e.VITE_AUTH_MODE !== 'oidc' || (e.VITE_OIDC_ISSUER != null && e.VITE_OIDC_CLIENT_ID != null),
    {
      message: 'VITE_OIDC_ISSUER and VITE_OIDC_CLIENT_ID are required when VITE_AUTH_MODE=oidc',
      path: ['VITE_AUTH_MODE'],
    },
  );

export const result = UiEnvSchema.safeParse(import.meta.env);

if (!result.success) {
  console.error('❌ Invalid UI environment variables:');
  console.error(z.treeifyError(result.error).errors);
  throw new Error('Invalid UI environment configuration');
}

export const uiEnv = result.data;
