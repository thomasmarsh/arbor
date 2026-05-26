// import { z } from 'zod';
// import { defineRoutes } from './define-routes.js';

// export const router = defineRoutes({
//   'users/': {
//     tag: 'users',
//     children: {
//       ':id/': {
//         tag: 'user',
//         children: {
//           'settings/': 'user-settings',
//         },
//       },
//     },
//   },
//   'orgs/:orgId/projects/': {
//     tag: 'org',
//     children: {
//       ':projectId/issues/': {
//         tag: 'project',
//         query: {
//           status: z.enum(['open', 'closed']).optional(),
//           page: z.coerce.number().default(1),
//         },
//         children: {
//           ':issueId/': 'issue',
//         },
//       },
//       ':projectId/settings/': {
//         tag: 'project-settings',
//         children: {
//           'members/': 'project-members',
//         },
//       },
//     },
//   },
// });

// export type Route = z.infer<typeof router.schema>;
// // | { tag: 'users' }
// // | { tag: 'user';             id: string }
// // | { tag: 'user-settings';    id: string }
// // | { tag: 'org';              orgId: string }
// // | { tag: 'project';          orgId: string; projectId: number; status?: 'open'|'closed'; page: number }
// // | { tag: 'project-settings'; orgId: string; projectId: number }
// // | { tag: 'project-members';  orgId: string; projectId: number }
// // | { tag: 'issue';            orgId: string; projectId: number; issueId: string }
