import z from 'zod';
import { defineRoutes, route } from '../core/define-routes.js';

const Users = z.object({ tag: z.literal('users') });
const User = z.object({ tag: z.literal('user'), id: z.string() });
const Settings = z.object({ tag: z.literal('settings') });
const Org = z.object({ tag: z.literal('org'), orgId: z.string() });
const Project = z.object({ tag: z.literal('project'), projectId: z.number() });
const Issue = z.object({
  tag: z.literal('issue'),
  issueId: z.string(),
  status: z.enum(['open', 'closed']).optional(),
  page: z.coerce.number().default(1),
});

export const routeFixtures = {
  userTree: () =>
    defineRoutes([
      route(Users, 'users/', [route(User, ':id/', [route(Settings, 'settings/')])]),
    ]),

  orgTree: () =>
    defineRoutes([
      route(Org, 'orgs/:orgId/', [route(Project, '#projectId/', [route(Issue, ':issueId/')])]),
    ]),

  combinedTree: () =>
    defineRoutes([
      route(Users, 'users/', [route(User, ':id/', [route(Settings, 'settings/')])]),
      route(Org, 'orgs/:orgId/', [route(Project, '#projectId/', [route(Issue, ':issueId/')])]),
    ]),
};
