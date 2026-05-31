import type { Result } from '@arbor/common';
import type { HttpContext } from '../contexts/http-context.js';
import type { RouteNode } from './route-node.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- HttpContext type params require any for covariant map
export type AnyCtxMap = Record<string, HttpContext<any, any, any, any, any, any, any>>;

export interface RouterContract<
  Route extends { tag: string },
  Map extends AnyCtxMap,
> {
  _type: Route;
  _ctxMap: Map;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for covariant children
  children: RouteNode<unknown, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}
