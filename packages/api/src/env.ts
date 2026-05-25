import { z } from 'zod';

const ApiEnvSchema = z.object({
  API_PORT: z.number().default(3001),
});

export const result = ApiEnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid UI environment variables:');
  console.error(z.flattenError(result.error).fieldErrors);
  throw new Error('Invalid UI environment configuration');
}

export const apiEnv = result.data;
