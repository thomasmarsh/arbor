/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import { buildable, type BuildableRouteNode } from './define-routes.js';
import { parseSegments } from './segments.js';
import type { RouteNode } from './route-node.js';
import type { Session, SessionMeta } from './session.js';

export function sessionRoute<
  ZS extends z.ZodObject<any, any>,
  S extends Session,
>(
  schema: ZS,
  path: string,
  _session: S,
): BuildableRouteNode<RouteNode<z.infer<ZS>, [], never, never, SessionMeta<S>>> {
  return buildable<RouteNode<z.infer<ZS>, [], never, never, SessionMeta<S>>>({
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: [] as [],
  });
}
