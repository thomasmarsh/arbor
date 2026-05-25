import { z } from 'zod';

export const HelloResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string().datetime(),
});

export type HelloResponse = z.infer<typeof HelloResponseSchema>;
