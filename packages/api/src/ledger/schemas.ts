import { z } from 'zod';

export const TaskStatus = z.enum(['in_progress', 'next', 'todo', 'done', 'canceled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Size = z.enum(['xs', 's', 'm', 'l', 'xl']);

export const MetaEntry = z.object({ type: z.literal('meta'), version: z.string(), description: z.string() });
export const EpicEntry = z.object({ type: z.literal('epic'), id: z.string(), title: z.string() });
export const StoryEntry = z.object({ type: z.literal('story'), id: z.string(), epic: z.string(), layer: z.string(), title: z.string() });
export const WaveEntry = z.object({ type: z.literal('wave'), id: z.string(), name: z.string() });
export const TaskEntry = z.object({
  type: z.literal('task'),
  kind: z.enum(['spike', 'task']),
  id: z.number(),
  epic: z.string(),
  story: z.string(),
  wave: z.string(),
  layer: z.string(),
  status: TaskStatus,
  text: z.string(),
  file: z.string(),
  size: Size.optional(),
  deps: z.array(z.number()).default([]),
  rank: z.number().optional(),
});

export type TaskEntry = z.infer<typeof TaskEntry>;
export type EpicEntry = z.infer<typeof EpicEntry>;
export type StoryEntry = z.infer<typeof StoryEntry>;
export type WaveEntry = z.infer<typeof WaveEntry>;
export type MetaEntry = z.infer<typeof MetaEntry>;

export const LedgerRow = z.discriminatedUnion('type', [MetaEntry, EpicEntry, StoryEntry, WaveEntry, TaskEntry]);
export type LedgerRow = z.infer<typeof LedgerRow>;
