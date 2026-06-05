import { z } from 'zod';
import { defineRoutes, httpRoute, integer, literal, object } from '@arbor/router';
import { TaskEntry, WaveEntry, PatchTaskStatusBody, PatchTaskRankBody } from '@arbor/app-common';

export type { TaskEntry, TaskStatus } from '@arbor/app-common';

const TasksResponse = z.object({
  tasks: z.array(TaskEntry),
  waves: z.array(WaveEntry),
});

const DisplayGroupsResponse = z.object({
  inProgress: z.array(TaskEntry),
  ready: z.array(TaskEntry),
  blocked: z.array(z.object({ task: TaskEntry, pendingDeps: z.array(z.number()) })),
  done: z.array(TaskEntry),
  canceled: z.array(TaskEntry),
});
export type DisplayGroupsResponse = z.infer<typeof DisplayGroupsResponse>;
const ErrorResponse = z.object({ error: z.string() });

const GetTasks        = object({ tag: literal('ledger-get-tasks') });
const GetQueue        = object({ tag: literal('ledger-get-queue') });
const GetTask         = object({ tag: literal('ledger-get-task'), id: integer() });
const PatchTaskStatus = object({ tag: literal('ledger-patch-task-status'), id: integer() });
const PatchTaskRank   = object({ tag: literal('ledger-patch-task-rank'), id: integer() });
const GetTaskPlan     = object({ tag: literal('ledger-get-task-plan'), id: integer() });

const PlanResponse = z.object({ content: z.string() });

export const ledgerRouter = defineRoutes([
  httpRoute(GetTasks, 'GET', 'api/ledger/tasks', {
    response: { 200: TasksResponse, 500: ErrorResponse },
  }),
  httpRoute(GetQueue, 'GET', 'api/ledger/queue', {
    response: { 200: DisplayGroupsResponse, 500: ErrorResponse },
  }),
  httpRoute(GetTask, 'GET', 'api/ledger/tasks/#id', {
    response: { 200: TaskEntry, 404: ErrorResponse, 500: ErrorResponse },
  }),
  httpRoute(PatchTaskStatus, 'PATCH', 'api/ledger/tasks/#id', {
    body: PatchTaskStatusBody,
    response: { 200: TaskEntry, 404: ErrorResponse, 500: ErrorResponse },
  }),
  httpRoute(PatchTaskRank, 'PATCH', 'api/ledger/tasks/#id/rank', {
    body: PatchTaskRankBody,
    response: { 200: TaskEntry, 404: ErrorResponse, 500: ErrorResponse },
  }),
  httpRoute(GetTaskPlan, 'GET', 'api/ledger/tasks/#id/plan', {
    response: { 200: PlanResponse, 404: ErrorResponse, 500: ErrorResponse },
  }),
]);

export type LedgerRouter = typeof ledgerRouter;
