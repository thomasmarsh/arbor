/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Result } from '@arbor/common';
import type { HttpContext } from '../contexts/http-context.js';
import type { RouteNode } from './route-node.js';

export type AnyCtxMap = Record<string, HttpContext<any, any, any, any, any, any>>;

export interface RouterContract<
  Route extends { tag: string },
  Map extends AnyCtxMap,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}
