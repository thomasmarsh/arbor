import { buildable, type BuildableRouteNode } from './define-routes.js';
import { parseSegments } from './segments.js';
import type { RouteNode } from './route-node.js';
import type { AnyObjectSchema, Infer } from './schema.js';
import type { Session, SessionMeta } from './session.js';

export function sessionRoute<
  ZS extends AnyObjectSchema,
  S extends Session,
>(
  schema: ZS,
  path: string,
  _session: S,
): BuildableRouteNode<RouteNode<Infer<ZS>, [], never, never, SessionMeta<S>>> {
  return buildable<RouteNode<Infer<ZS>, [], never, never, SessionMeta<S>>>({
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: [] as [],
  });
}
