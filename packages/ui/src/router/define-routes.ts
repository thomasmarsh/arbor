import { Result } from '@arbor/common';
import { z } from 'zod';

// ── Internal AST ──────────────────────────────────────────────────────────────
// This is never exposed to the user

type Segment =
  | { kind: 'lit'; value: string }
  | { kind: 'str'; name: string }
  | { kind: 'num'; name: string };

interface ASTNode {
  tag: string | null;
  segments: Segment[];
  query: Record<string, z.ZodTypeAny>;
  children: ASTNode[];
}

// ── DSL input types ───────────────────────────────────────────────────────────
// This is what the user writes

type QueryDef = Record<string, z.ZodTypeAny>;
type RouteDef = string | { tag?: string; query?: QueryDef; children?: RouteMap };
type RouteMap = Record<string, RouteDef>;

// ── Step 1: compile DSL → AST ─────────────────────────────────────────────────

function parseSegments(key: string): Segment[] {
  return key
    .split('/')
    .filter(Boolean)
    .map((s): Segment => {
      if (s.startsWith('#')) return { kind: 'num', name: s.slice(1) };
      if (s.startsWith(':')) return { kind: 'str', name: s.slice(1) };
      return { kind: 'lit', value: s };
    });
}

function compileAST(map: RouteMap): ASTNode[] {
  return Object.entries(map).map(
    ([key, def]): ASTNode => ({
      tag: typeof def === 'string' ? def : (def.tag ?? null),
      segments: parseSegments(key),
      query: typeof def === 'string' ? {} : (def.query ?? {}),
      children: typeof def === 'string' ? [] : compileAST(def.children ?? {}),
    }),
  );
}

// ── Step 2: compile AST → Zod discriminated union ────────────────────────────
// Walks the AST accumulating param schemas from ancestors,
// emits one ZodObject per tagged node

function compileSchema(nodes: ASTNode[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objects: z.ZodObject<any>[] = [];

  function walk(node: ASTNode, inherited: Record<string, z.ZodTypeAny>) {
    const params = { ...inherited };

    for (const seg of node.segments) {
      if (seg.kind === 'str') params[seg.name] = z.string();
      if (seg.kind === 'num') params[seg.name] = z.number();
    }

    if (node.tag !== null) {
      objects.push(
        z.object({
          tag: z.literal(node.tag),
          ...params,
          ...node.query,
        }),
      );
    }

    for (const child of node.children) {
      walk(child, params);
    }
  }

  for (const node of nodes) walk(node, {});

  return z.discriminatedUnion(
    'tag',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    objects as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]],
  );
}

// ── Step 3: parse URL → raw match ─────────────────────────────────────────────
// Walks the AST against URL segments, accumulating param values

function matchSegments(
  astSegments: Segment[],
  urlSegments: string[],
  params: Record<string, unknown>,
): { params: Record<string, unknown>; rest: string[] } | null {
  if (astSegments.length > urlSegments.length) return null;

  const next = { ...params };

  for (let i = 0; i < astSegments.length; i++) {
    const seg = astSegments[i];
    const url = urlSegments[i];
    if (seg === undefined) continue; // TODO
    if (seg.kind === 'lit' && seg.value !== url) return null;
    if (seg.kind === 'str') next[seg.name] = url;
    if (seg.kind === 'num') {
      const n = Number(url);
      if (isNaN(n)) return null;
      next[seg.name] = n;
    }
  }

  return { params: next, rest: urlSegments.slice(astSegments.length) };
}

function walkAST(
  nodes: ASTNode[],
  segments: string[],
  params: Record<string, unknown>,
  query: URLSearchParams,
): Record<string, unknown> | null {
  for (const node of nodes) {
    const match = matchSegments(node.segments, segments, params);
    if (!match) continue;

    const { params: nextParams, rest } = match;

    if (rest.length > 0 && node.children.length > 0) {
      const child = walkAST(node.children, rest, nextParams, query);
      if (child) return child;
    }

    if (rest.length === 0 && node.tag !== null) {
      const parsedQuery: Record<string, unknown> = {};
      for (const [name, schema] of Object.entries(node.query)) {
        const raw = query.getAll(name).length > 1 ? query.getAll(name) : query.get(name);
        const result = schema.safeParse(raw ?? undefined);
        if (!result.success) return null;
        parsedQuery[name] = result.data;
      }
      return { tag: node.tag, ...nextParams, ...parsedQuery };
    }
  }

  return null;
}

// ── Step 4: print Route → URL ─────────────────────────────────────────────────
// Walks the AST accumulating segments until it finds the matching tag,
// then substitutes param values

function walkPrint(
  nodes: ASTNode[],
  route: Record<string, unknown>,
  accumulated: Segment[],
): Segment[] | null {
  for (const node of nodes) {
    const path = [...accumulated, ...node.segments];

    if (node.tag === route['tag']) return path;

    const found = walkPrint(node.children, route, path);
    if (found) return found;
  }
  return null;
}

function printSegments(segments: Segment[], params: Record<string, unknown>): string {
  return (
    '/' +
    segments.map((seg) => (seg.kind === 'lit' ? seg.value : String(params[seg.name]))).join('/')
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function defineRoutes(map: RouteMap) {
  const ast = compileAST(map);
  const schema = compileSchema(ast);

  type Route = z.infer<typeof schema>;

  return {
    schema,

    parse(url: URL): Result<Route, string> {
      const segments = url.pathname.split('/').filter(Boolean);
      const raw = walkAST(ast, segments, {}, url.searchParams);
      if (!raw) return Result.failure(`no route: ${url.pathname}`);
      const result = schema.safeParse(raw);
      return result.success ? Result.success(result.data) : Result.failure(result.error.message);
    },

    print(route: Route): string {
      const segments = walkPrint(ast, route, []);
      return segments ? printSegments(segments, route) : '/';
    },
  };
}
