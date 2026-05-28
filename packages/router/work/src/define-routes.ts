/* eslint-disable @typescript-eslint/no-explicit-any */

import { Result } from '@arbor/common';
import z from 'zod';

/**
 * Flattens an intersection type into a single object type.
 * `{ tag: 'user' } & { id: string }` becomes `{ tag: 'user'; id: string }`.
 * @internal
 */
export type Flatten<T> = { [K in keyof T]: T[K] };

// ── InferRoute ──────────────────────────────────────────────────────

/** Extract the route union type from a router returned by {@link defineRoutes}. */
export type InferRoute<R extends { _type: unknown }> = R['_type'];

/** Extract the Context type from a {@link RouteNode}. */
export type InferContext<N extends { _context: unknown }> = N['_context'];

// ── Segment types and parseSegments ─────────────────────────────────

/**
 * A single segment of a URL path.
 * - `lit` — a literal string segment e.g. `users`
 * - `str` — a named string parameter e.g. `:id`
 * - `num` — a named numeric parameter e.g. `#id`
 * - `opt-str` — an optional string parameter e.g. `:id?`
 * - `opt-num` — an optional numeric parameter e.g. `#id?`
 * - `wildcard` — captures all remaining segments e.g. `*rest`
 * @internal
 */
type Segment =
  | { kind: 'lit'; value: string }
  | { kind: 'str'; name: string }
  | { kind: 'num'; name: string }
  | { kind: 'opt-str'; name: string }
  | { kind: 'opt-num'; name: string }
  | { kind: 'wildcard'; name: string };

/** @internal */
export function parseSegments(path: string): Segment[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((s): Segment => {
      if (s.startsWith('*')) return { kind: 'wildcard', name: s.slice(1) };
      if (s.startsWith('#') && s.endsWith('?')) return { kind: 'opt-num', name: s.slice(1, -1) };
      if (s.startsWith(':') && s.endsWith('?')) return { kind: 'opt-str', name: s.slice(1, -1) };
      if (s.startsWith('#')) return { kind: 'num', name: s.slice(1) };
      if (s.startsWith(':')) return { kind: 'str', name: s.slice(1) };
      return { kind: 'lit', value: s };
    });
}

// ── RouteNode, Derive, ChildUnion ────────────────────────────────────

/**
 * A node in the route tree. Carries phantom type parameters that are erased at
 * runtime but allow TypeScript to derive the full {@link InferRoute} union
 * statically without codegen.
 *
 * @typeParam R     - The route type this node produces when matched as a terminal
 * @typeParam Child - The union of route types produced by this node's children
 * @typeParam C     - The children tuple, preserved as a type parameter so
 *                    composition via spread retains full type information
 */
export interface RouteNode<R, Child, C extends RouteNode<unknown, unknown, any, any>[] = [], Context = never> {
  /** @internal Phantom type carrier — always `undefined` at runtime */
  _type: R;
  /** @internal Phantom type carrier — always `undefined` at runtime */
  _child: Child;
  /** @internal Phantom type carrier — always `undefined` at runtime */
  _context: Context;
  /** Zod schema for this node's own params and tag. `null` for {@link section} nodes. */
  schema: z.ZodObject<any, any> | null;
  /** The path string for this node e.g. `users/`, `:id/`, `#projectId/` */
  path: string;
  /** Child nodes — preserved as a typed tuple for composition */
  children: C;
}

/**
 * Derives the nested route type for a single {@link RouteNode}.
 *
 * Three cases:
 * - **Section node** (`R = never`) — has no tag of its own, child is required:
 *   `{ child: Child }`
 * - **Leaf node** (`Child = never`) — terminal route, no child field:
 *   `{ tag: '...'; ...params }`
 * - **Tagged node with children** — valid terminal route that also has children,
 *   child is optional: `{ tag: '...'; ...params; child?: Child }`
 *
 * `[R] extends [never]` and `[Child] extends [never]` wrap in tuples to prevent
 * TypeScript's distributive conditional behaviour which makes bare
 * `never extends never` unreliable.
 *
 * @internal
 */
export type Derive<N> =
  N extends RouteNode<infer R, infer Child, any, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }> // section — child required
      : [Child] extends [never]
        ? Flatten<R> // leaf — no child
        : Flatten<R & { child?: Child }> // tagged node with children — child optional
    : never;

/**
 * Derives the union of route types from a tuple of {@link RouteNode}s by
 * applying {@link Derive} to each element and collecting the results.
 *
 * This is the core type-level operation that makes the full {@link InferRoute}
 * union statically knowable from the `defineRoutes` call site — no codegen
 * required.
 *
 * Example:
 * ```typescript
 * type C = [RouteNode<{ tag: 'users' }, never>, RouteNode<{ tag: 'org'; orgId: string }, never>]
 * type U = ChildUnion<C>
 * // { tag: 'users' } | { tag: 'org'; orgId: string }
 * ```
 *
 * @internal
 */
export type ChildUnion<C extends RouteNode<unknown, unknown, any, any>[]> = {
  [K in keyof C]: Derive<C[K]>;
}[number];

/**
 * Builds a flat mapping from route tag → Context for every tagged node in a
 * children tuple. Used as a phantom type on the router so that consumers
 * (e.g. `createServer`) can look up context by tag without walking the tree
 * at the type level.
 *
 * @internal
 */
export type CtxMap<C extends RouteNode<unknown, unknown, any, any>[]> = {
  [N in C[number] as N extends RouteNode<{ tag: infer T extends string }, any, any, any> ? T : never]:
    N extends RouteNode<any, any, any, infer Ctx> ? Ctx : never;
};

// ── matchSegments ────────────────────────────────────────────────────

/**
 * Attempts to match a sequence of AST {@link Segment}s against URL path segments,
 * accumulating captured param values into `params`.
 *
 * Returns the updated params and any remaining unmatched URL segments on success,
 * or `null` if the segments do not match.
 *
 * Segment matching rules:
 * - `lit`      — must equal the URL segment exactly, contributes no params
 * - `str`      — captures the URL segment as a string param
 * - `num`      — captures the URL segment as a number param, fails if not numeric
 * - `opt-str`  — captures the URL segment as a string param if present, skips if absent
 * - `opt-num`  — captures the URL segment as a number param if present and numeric,
 *                skips otherwise leaving the segment in the URL for the next matcher
 * - `wildcard` — captures all remaining URL segments as a string array param
 *
 * @internal
 */
export function matchSegments(
  astSegments: Segment[],
  urlSegments: string[],
  params: Record<string, unknown>,
): { params: Record<string, unknown>; rest: string[] } | null {
  const next = { ...params };
  let urlIndex = 0;

  for (const seg of astSegments) {
    const url = urlSegments[urlIndex];

    switch (seg.kind) {
      case 'lit':
        if (url !== seg.value) return null;
        urlIndex++;
        break;

      case 'str':
        if (url == null) return null;
        next[seg.name] = url;
        urlIndex++;
        break;

      case 'num': {
        if (url == null) return null;
        const n = Number(url);
        if (isNaN(n)) return null;
        next[seg.name] = n;
        urlIndex++;
        break;
      }

      case 'opt-str':
        if (url != null) {
          next[seg.name] = url;
          urlIndex++;
        }
        break;

      case 'opt-num': {
        if (url != null) {
          const n = Number(url);
          if (!isNaN(n)) {
            next[seg.name] = n;
            urlIndex++;
          }
        }
        break;
      }

      case 'wildcard':
        next[seg.name] = urlSegments.slice(urlIndex);
        urlIndex = urlSegments.length;
        break;
    }
  }

  return {
    params: next,
    rest: urlSegments.slice(urlIndex),
  };
}

// ── walkParse ────────────────────────────────────────────────────────

/**
 * Retrieves the shape of a Zod object schema, handling both Zod v3 (shape as
 * property) and Zod v4 (shape as function).
 * @internal
 */
function getShape(schema: z.ZodObject<any, any>): Record<string, z.z.ZodType> {
  const s = schema.shape as Record<string, z.z.ZodType> | (() => Record<string, z.z.ZodType>);
  return typeof s === 'function' ? s() : s;
}

/**
 * Reads the literal tag value from a Zod object schema's `tag` field.
 * Returns `undefined` if the schema has no `tag` field or it is not a literal.
 * @internal
 */
function getTag(schema: z.ZodObject<any, any>): string | undefined {
  const tag = getShape(schema)['tag'];
  return tag instanceof z.ZodLiteral ? (tag.value as string) : undefined;
}

/**
 * Recursively walks the route tree attempting to match URL segments against
 * each node's path. Accumulates path params as it descends and validates
 * the full param set against the terminal node's Zod schema in a single pass —
 * intermediate nodes are only used for segment matching, not validation.
 *
 * Returns the matched and validated route object on success, or `null` if no
 * node in the tree matches the given URL segments.
 *
 * @param nodes       - The current level of the route tree
 * @param urlSegments - Remaining URL path segments to match
 * @param query       - Query string params for the terminal node
 * @param params      - Path params accumulated from ancestor nodes
 *
 * @internal
 */
export function walkParse(
  nodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[],
  urlSegments: string[],
  query: URLSearchParams,
  params: Record<string, unknown> = {},
): Record<string, unknown> | null {
  for (const node of nodes) {
    const match = matchSegments(parseSegments(node.path), urlSegments, params);
    if (!match) continue;

    const { params: nextParams, rest } = match;

    if (rest.length > 0) {
      // not terminal — recurse into children with accumulated params
      if (node.children.length === 0) continue;

      const child = walkParse(
        node.children as RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[],
        rest,
        query,
        nextParams,
      );
      if (!child) continue;

      // section nodes have no schema — wrap child and return
      if (node.schema === null) return { child };

      // validate this node's own params and attach the child result
      const raw = { ...nextParams, tag: getTag(node.schema) };
      const result = node.schema.safeParse(raw);
      if (!result.success) continue;

      return {
        ...Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined)),
        child,
      };
    }

    // terminal — section nodes cannot match as terminals
    if (node.schema === null) continue;

    const shape = getShape(node.schema);

    // build raw input: path params + injected tag + query params
    const raw: Record<string, unknown> = {
      ...nextParams,
      tag: getTag(node.schema),
    };

    // pull query param values from URLSearchParams for any schema key
    // that wasn't captured as a path param
    for (const key of Object.keys(shape)) {
      if (key === 'tag' || key in raw) continue;
      const vals = query.getAll(key);
      if (vals.length > 1) raw[key] = vals;
      else if (vals.length === 1) raw[key] = vals[0];
    }

    const result = node.schema.safeParse(raw);
    if (!result.success) continue;

    return Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
  }

  return null;
}

// ── walkPrint ────────────────────────────────────────────────────────

/**
 * Collects the names of all non-literal segments (path params) so
 * `buildUrl` can distinguish path params from query params.
 * @internal
 */
function collectPathParamNames(segments: Segment[]): Set<string> {
  const names = new Set<string>();
  for (const seg of segments) {
    if (seg.kind !== 'lit') names.add(seg.name);
  }
  return names;
}

/**
 * Recursively walks the route tree to find the path segments needed to print
 * a given route object as a URL string.
 *
 * Accumulates segments and path param names as it descends. When the current
 * node's tag matches the route's tag, it either:
 * - Recurses into children with `route.child` if the route has a child (consuming
 *   one level of the route chain)
 * - Returns the accumulated segments if the route has no child (terminal match)
 *
 * If the tag does not match, tries children with the same route level — this
 * handles section nodes and intermediate nodes whose tag is deeper in the tree.
 *
 * Returns the accumulated segments and param names on success, or `null` if no
 * path through the tree matches the route.
 *
 * @param nodes       - The current level of the route tree
 * @param route       - The route object to print, may have a `child` for nested routes
 * @param accumulated - Segments and param names collected from ancestor nodes
 *
 * @internal
 */
export function walkPrint(
  nodes: RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[],
  route: Record<string, unknown>,
  accumulated: { segments: Segment[]; paramNames: Set<string> },
): { segments: Segment[]; paramNames: Set<string> } | null {
  for (const node of nodes) {
    const segments = parseSegments(node.path);
    const paramNames = new Set([...accumulated.paramNames, ...collectPathParamNames(segments)]);
    const path = { segments: [...accumulated.segments, ...segments], paramNames };

    const tagMatches = node.schema !== null && getTag(node.schema) === route['tag'];

    if (tagMatches) {
      if (route['child']) {
        // tag matches but route has a child — consume this level and recurse
        const found = walkPrint(
          node.children as RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[],
          route['child'] as Record<string, unknown>,
          path,
        );
        if (found) return found;
      } else {
        // tag matches and no child — terminal, return accumulated path
        return path;
      }
    } else if (node.children.length > 0) {
      // tag doesn't match at this level — descend without consuming route level
      // (handles section nodes and nodes whose tag is deeper in the tree)
      const found = walkPrint(
        node.children as RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[],
        route,
        path,
      );
      if (found) return found;
    }
  }

  return null;
}

/**
 * Builds a URL string from the result of {@link walkPrint} and the route object.
 *
 * Two-step process:
 * 1. **Path** — substitutes path param values into the accumulated segments,
 *    traversing the full `route.child` chain to collect all param values from
 *    every nesting level.
 * 2. **Query string** — any field in the route chain that is not `tag`, `child`,
 *    or a path param is appended as a query param. Fields with `undefined` values
 *    are omitted.
 *
 * Note: default values (e.g. `page: 1`) are serialised if present in the route
 * object. Callers that want clean URLs should omit default-valued fields before
 * calling `print`.
 *
 * @internal
 */
export function buildUrl(
  result: { segments: Segment[]; paramNames: Set<string> },
  route: Record<string, unknown>,
): string {
  // traverse the full route chain to collect params from every nesting level
  const allParams: Record<string, unknown> = {};
  let current: Record<string, unknown> | undefined = route;
  while (current) {
    Object.assign(allParams, current);
    current = current['child'] as Record<string, unknown> | undefined;
  }

  const path =
    '/' +
    result.segments
      .map((seg) => (seg.kind === 'lit' ? seg.value : String(allParams[seg.name])))
      .join('/');

  const query = Object.entries(allParams)
    .filter(
      ([k, v]) => k !== 'tag' && k !== 'child' && !result.paramNames.has(k) && v !== undefined,
    )
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  return query ? `${path}?${query}` : path;
}

// ── route, section, defineRoutes ─────────────────────────────────────

/**
 * Declares a named route node in the route tree.
 *
 * @param schema   - A Zod object schema that defines this route's params and tag.
 *                   The `tag` field must be a `z.literal(...)` — it is used to
 *                   identify the route during both parsing and printing.
 * @param path     - The URL path segment(s) this node matches, relative to its
 *                   parent. Supports:
 *                   - `'users/'`    — literal segment
 *                   - `':id/'`      — string param
 *                   - `'#id/'`      — numeric param
 *                   - `':id?/'`     — optional string param
 *                   - `'#id?/'`     — optional numeric param
 *                   - `'*rest/'`    — wildcard (captures all remaining segments)
 *                   - `'orgs/:id/'` — multiple segments in one node
 * @param children - Optional child route nodes. When present, this node is both
 *                   a valid terminal route (matching the URL at this depth) AND
 *                   a prefix for deeper routes. The `child` field in the parsed
 *                   result will be optional.
 *
 * @example
 * ```typescript
 * const Users = z.object({ tag: z.literal('users') });
 * const User  = z.object({ tag: z.literal('user'), id: z.string() });
 *
 * route(Users, 'users/', [
 *   route(User, ':id/'),
 * ]);
 * // matches /users        → { tag: 'users' }
 * // matches /users/123    → { tag: 'users', child: { tag: 'user', id: '123' } }
 * ```
 *
 * @typeParam S - The Zod schema type, preserved for inference
 * @typeParam C - The children tuple type, preserved so {@link ChildUnion} can
 *               derive the full nested {@link InferRoute} union statically
 */
export function route<
  S extends z.ZodObject<any, any>,
  C extends RouteNode<unknown, unknown, any, any>[] = [],
>(
  schema: S,
  path: string,
  children?: [...C],
): RouteNode<z.infer<S>, [ChildUnion<C>] extends [never] ? never : ChildUnion<C>, [...C], never> {
  return {
    _type: undefined as never, // phantom — exists only at the type level
    _child: undefined as never, // phantom — exists only at the type level
    _context: undefined as never, // phantom — exists only at the type level
    schema,
    path,
    children: (children ?? []) as [...C],
  };
}

/**
 * Declares a structural (unnamed) route node — a path prefix that is not itself
 * a valid terminal route.
 *
 * Unlike {@link route}, a `section` has no Zod schema and no tag. It cannot be
 * matched as a terminal — navigating to its URL returns a parse failure. It
 * exists purely to group child routes under a shared path prefix.
 *
 * Because `section` has no tag (`R = never`), {@link Derive} produces
 * `{ child: Child }` with a **required** child, not optional. This makes it
 * impossible to represent a section node without a child in the route type.
 *
 * @param path     - The URL path segment(s) this node matches, relative to its
 *                   parent. Supports the same syntax as {@link route}.
 * @param children - The child route nodes grouped under this prefix. Required —
 *                   a section with no children would be unreachable.
 *
 * @example
 * ```typescript
 * section('orgs/:orgId/', [
 *   route(Project, '#projectId/'),
 * ]);
 * // /orgs/acme      → parse failure (section is not a terminal route)
 * // /orgs/acme/42   → { child: { tag: 'project', projectId: 42 } }
 * ```
 *
 * @typeParam C - The children tuple type, preserved so {@link ChildUnion} can
 *               derive the full nested {@link InferRoute} union statically
 */
export function section<C extends RouteNode<unknown, unknown, any, any>[]>(
  path: string,
  children: [...C],
): RouteNode<never, ChildUnion<C>, [...C], never> {
  return {
    _type: undefined as never, // phantom — exists only at the type level
    _child: undefined as never, // phantom — exists only at the type level
    _context: undefined as never, // phantom — exists only at the type level
    schema: null, // no schema — section nodes cannot be terminal
    path,
    children,
  };
}

/**
 * Defines a route tree and returns a router with `parse` and `print` methods.
 *
 * The `Route` type is derived statically from the tree structure — no manual
 * type declarations required. Each {@link route} and {@link section} node
 * contributes its own type to the union via {@link ChildUnion}, producing a
 * fully typed nested discriminated union:
 *
 * ```typescript
 * const router = defineRoutes([
 *   route(Users, 'users/', [
 *     route(User, ':id/'),
 *   ]),
 * ]);
 *
 * type Route = typeof router._type;
 * // { tag: 'users'; child?: { tag: 'user'; id: string } }
 *
 * // or with InferRoute:
 * type Route = InferRoute<typeof router>;
 * ```
 *
 * Sub-routers can be composed by spreading `.children`:
 *
 * ```typescript
 * const router = defineRoutes([
 *   ...orgRouter.children,
 *   ...userRouter.children,
 * ]);
 * ```
 *
 * @param children - The top-level route nodes. Accepts output of {@link route}
 *                   and {@link section}, as well as spreads of `.children` from
 *                   other routers for composition.
 *
 * @returns An object with:
 * - `_type`    — phantom type carrier for `typeof router._type` / {@link InferRoute}
 * - `children` — the route tree, typed as a tuple for composition
 * - `parse`    — parses a `URL` into `Result<Route, string>`
 * - `print`    — serialises a `Route` back into a URL string
 *
 * @typeParam C - The children tuple type, preserved so {@link ChildUnion} can
 *               derive the full {@link InferRoute} union statically
 */
export function defineRoutes<C extends RouteNode<unknown, unknown, any, any>[] = []>(children: [...C]) {
  type Route = ChildUnion<C>;

  // cast needed: the children tuple carries specific R/Child types but walkParse
  // operates on the base constraint — type information is preserved via phantoms
  const nodes = children as RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>[];

  return {
    /** Phantom type carrier — always `undefined` at runtime. Use {@link InferRoute} or `typeof router._type` to extract the `Route` union. */
    _type: undefined as never as Route,

    /** @internal Phantom type carrier — maps tag → Context for each tagged node. */
    _ctxMap: undefined as never as CtxMap<[...C]>,

    /** The route tree as a typed tuple. Spread into another {@link defineRoutes} call to compose routers. */
    children,

    /**
     * Parses a `URL` into a `Route` object.
     * Returns `Result.failure` if no route in the tree matches the URL.
     */

    parse(url: URL): Result<Route, string> {
      const segments = url.pathname.split('/').filter(Boolean);
      const raw = walkParse(nodes, segments, url.searchParams);
      if (!raw) return Result.failure(`no route: ${url.pathname}`);
      return Result.success(raw) as Result<Route, string>;
    },

    /**
     * Serialises a `Route` object back into a URL string.
     * Query params are appended for any field that is not a path param, `tag`,
     * or `child`. Returns `'/'` if the route cannot be matched in the tree.
     */
    print(route: Route): string {
      const result = walkPrint(nodes, route, {
        segments: [],
        paramNames: new Set(),
      });
      return result ? buildUrl(result, route) : '/';
    },
  };
}
