import { z } from 'zod';

export const UserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string(),
});

export const ReauthCompleteMessageSchema = z.object({
  tag: z.literal('reauth-complete'),
});

export const PopupMessageSchema = z.discriminatedUnion('tag', [
  z.object({ tag: z.literal('reauth-complete') }),
  z.object({ tag: z.literal('reauth-failed') }),
]);

export type PopupMessage = z.infer<typeof PopupMessageSchema>;
