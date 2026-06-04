import { integer, literal, object, optional, string } from '../core/schema.js';
import { defineRoutes, route } from '../core/define-routes.js';

const Users = object({ tag: literal('users') });
const User = object({ tag: literal('user'), id: string() });
const Settings = object({ tag: literal('settings') });
const Org = object({ tag: literal('org'), orgId: string() });
const Project = object({ tag: literal('project'), projectId: integer() });
// status and page arrive as strings from URLSearchParams; no coercion or defaults in native schema
const Issue = object({
  tag: literal('issue'),
  issueId: string(),
  status: optional(string()),
  page: optional(string()),
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
