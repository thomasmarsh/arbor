import { z } from 'zod';

export const UserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string(),
});

export const ReauthCompleteMessageSchema = z.object({
  tag: z.literal('reauth-complete'),
});
