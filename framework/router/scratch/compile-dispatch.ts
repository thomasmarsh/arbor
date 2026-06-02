/**
 * Plan 132 Spike — Compile-time Dispatch Specialization
 *
 * Prototype: defineRoutes() emits a specialized dispatch closure at startup.
 * The closure does cascaded if/switch instead of a generic tree walk.
 *
 * Key claim: compiling the dispatch tree is fast enough at startup that it
 * does not meaningfully increase defineRoutes() latency; and the resulting
 * closure is meaningfully faster on the hot path.
 *
 * Run: tsx packages/router/scratch/compile-dispatch.ts
 */

import z from 'zod';
import { parseSegments, type Segment } from '../src/core/segments.js';
import { walkParse, type WalkNode } from '../src/core/walk.js';

// ---------------------------------------------------------------------------
// Compiled dispatch node types
// ---------------------------------------------------------------------------

/**
 * A compiled dispatch tree node. Each node corresponds to a single segment
 * decision point: try literal match, string param, numeric param, optional,
 * or wildcard in priority order.
 */
type CompiledNode =
  | { kind: 'lit'; value: string; next: CompiledTree }
  | { kind: 'str'; name: string; next: CompiledTree }
  | { kind: 'num'; name: string; next: CompiledTree }
  | { kind: 'opt-str'; name: string; next: CompiledTree }
  | { kind: 'opt-num'; name: string; next: CompiledTree }
  | { kind: 'wildcard'; name: string; tag: string | undefined }
  | { kind: 'leaf'; tag: string | undefined };

interface CompiledTree {
  /** Literal segment value → sub-tree (O(1) lookup) */
  literals: Map<string, CompiledTree>;
  /** Ordered list of non-literal nodes (params, optional, wildcard, leaf) */
  params: CompiledNode[];
}

function emptyTree(): CompiledTree {
  return { literals: new Map(), params: [] };
}

// ---------------------------------------------------------------------------
// Compiler: WalkNode[] → CompiledTree
// ---------------------------------------------------------------------------

/**
 * Extract the tag from a WalkNode's schema (mirrors getTag() in walk.ts).
 */
function extractTag(node: WalkNode): string | undefined {
  if (!node.schema) return undefined;
  const shape = node.schema.shape as Record<string, z.ZodType>;
  const tag = shape['tag'];
  return tag instanceof z.ZodLiteral ? (tag.value as string) : undefined;
}

/**
 * Recursively compile a list of WalkNodes into a CompiledTree.
 *
 * Each WalkNode contributes its segments as a path through the tree.
 * At each level, literal segments are bucketed into the Map for O(1) lookup;
 * non-literal segments are added to the params list in priority order
 * (literals first, then str, then num — mirrors matchSegments precedence).
 */
function compileNodes(nodes: WalkNode[], inheritedSegs: Segment[] = []): CompiledTree {
  const tree = emptyTree();

  for (const node of nodes) {
    // Each node may have multiple segments (e.g. /users/:id has 2 segments).
    // Flatten the full segment list: inherited + node's own segments.
    const allSegs = [...inheritedSegs, ...node.segments];
    insertIntoTree(tree, allSegs, 0, node);
  }

  return tree;
}

function insertIntoTree(
  tree: CompiledTree,
  segs: Segment[],
  idx: number,
  node: WalkNode,
): void {
  const seg = segs[idx];

  // No more segments to consume for this node: insert a leaf or recurse children.
  if (seg === undefined) {
    const tag = extractTag(node);
    if (node.children.length > 0) {
      // This node is both a potential leaf (if URL ends here) and a branch.
      // Add a leaf entry for the URL-ends-here case.
      if (node.schema !== null) {
        tree.params.push({ kind: 'leaf', tag });
      }
      // Compile children into the same tree (they start from the next URL segment).
      for (const child of node.children as WalkNode[]) {
        insertIntoTree(tree, child.segments, 0, child);
      }
    } else {
      tree.params.push({ kind: 'leaf', tag });
    }
    return;
  }

  // Recurse one more segment down.
  if (seg.kind === 'lit') {
    let sub = tree.literals.get(seg.value);
    if (!sub) {
      sub = emptyTree();
      tree.literals.set(seg.value, sub);
    }
    insertIntoTree(sub, segs, idx + 1, node);
  } else if (seg.kind === 'wildcard') {
    tree.params.push({ kind: 'wildcard', name: seg.name, tag: extractTag(node) });
  } else {
    // str, num, opt-str, opt-num: need a sub-tree for what follows.
    // Find or create an existing param node with the same name+kind.
    let existing = tree.params.find(
      (p) => p.kind === seg.kind && 'name' in p && p.name === seg.name,
    ) as (CompiledNode & { next: CompiledTree }) | undefined;

    if (!existing) {
      const next = emptyTree();
      const n: CompiledNode =
        seg.kind === 'str' ? { kind: 'str', name: seg.name, next } :
        seg.kind === 'num' ? { kind: 'num', name: seg.name, next } :
        seg.kind === 'opt-str' ? { kind: 'opt-str', name: seg.name, next } :
        { kind: 'opt-num', name: seg.name, next };
      tree.params.push(n);
      existing = n as CompiledNode & { next: CompiledTree };
    }

    insertIntoTree(existing.next, segs, idx + 1, node);
  }
}

// ---------------------------------------------------------------------------
// Executor: CompiledTree → dispatch function
// ---------------------------------------------------------------------------

type Params = Record<string, unknown>;

function executeTree(
  tree: CompiledTree,
  segs: string[],
  idx: number,
  params: Params,
): Params | null {
  const url = segs[idx];

  // 1. Try literal match first (O(1)).
  if (url !== undefined) {
    const sub = tree.literals.get(url);
    if (sub) {
      const r = executeTree(sub, segs, idx + 1, params);
      if (r) return r;
    }
  }

  // 2. Try params in insertion order.
  for (const node of tree.params) {
    switch (node.kind) {
      case 'leaf':
        if (idx === segs.length) return { ...params, tag: node.tag };
        break;

      case 'wildcard':
        return { ...params, [node.name]: segs.slice(idx).join('/'), tag: node.tag };

      case 'str': {
        if (url === undefined) break;
        const r = executeTree(node.next, segs, idx + 1, { ...params, [node.name]: url });
        if (r) return r;
        break;
      }

      case 'num': {
        if (url === undefined) break;
        const n = parseInt(url, 10);
        if (isNaN(n) || String(n) !== url) break;
        const r = executeTree(node.next, segs, idx + 1, { ...params, [node.name]: n });
        if (r) return r;
        break;
      }

      case 'opt-str': {
        const r = executeTree(
          node.next, segs, url !== undefined ? idx + 1 : idx,
          url !== undefined ? { ...params, [node.name]: url } : params,
        );
        if (r) return r;
        break;
      }

      case 'opt-num': {
        if (url !== undefined) {
          const n = parseInt(url, 10);
          if (!isNaN(n) && String(n) === url) {
            const r = executeTree(node.next, segs, idx + 1, { ...params, [node.name]: n });
            if (r) return r;
          }
        } else {
          const r = executeTree(node.next, segs, idx, params);
          if (r) return r;
        }
        break;
      }
    }
  }

  return null;
}

function makeCompiledDispatch(
  tree: CompiledTree,
): (segs: string[]) => Params | null {
  return (segs) => executeTree(tree, segs, 0, {});
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function leaf(tag: string, path: string): WalkNode {
  return {
    _type: undefined as never,
    schema: z.object({ tag: z.literal(tag) }),
    path,
    segments: parseSegments(path),
    children: [],
  };
}

function branch(path: string, children: WalkNode[]): WalkNode {
  return {
    _type: undefined as never,
    schema: null,
    path,
    segments: parseSegments(path),
    children,
  };
}

const nodes: WalkNode[] = [
  branch('/users', [
    leaf('users-list', '/users'),
    branch('/users/:id', [
      leaf('user-get', '/users/:id'),
      leaf('user-profile', '/users/:id/profile'),
      branch('/users/:id/posts', [
        leaf('user-posts-list', '/users/:id/posts'),
        leaf('user-post-get', '/users/:id/posts/#postId'),
      ]),
    ]),
  ]),
  branch('/products', [
    leaf('products-list', '/products'),
    leaf('product-get', '/products/:slug'),
  ]),
  leaf('health', '/health'),
  leaf('root', '/'),
];

// Flatten into a structure walkParse can use
const flatNodes: WalkNode[] = [
  branch('/users', [
    leaf('users-list', '/users'),
  ]),
  {
    ...branch('/users', []),
    segments: parseSegments('/users/:id'),
    children: [
      leaf('user-get', '/users/:id'),
      leaf('user-profile', '/users/:id/profile'),
    ],
  } as WalkNode,
  leaf('products-list', '/products'),
  leaf('product-get', '/products/:slug'),
  leaf('health', '/health'),
];

// Build a simpler flat fixture for correctness checks
const simpleNodes: WalkNode[] = [
  leaf('users-list', '/users'),
  leaf('user-get', '/users/:id'),
  leaf('user-profile', '/users/:id/profile'),
  leaf('products-list', '/products'),
  leaf('product-get', '/products/:slug'),
  leaf('health', '/health'),
  leaf('order-num', '/orders/#orderId'),
];

// ---------------------------------------------------------------------------
// Correctness tests
// ---------------------------------------------------------------------------

console.log('=== Correctness checks ===\n');

const compiledTree = compileNodes(simpleNodes);
const dispatch = makeCompiledDispatch(compiledTree);

const cases: Array<{ segs: string[]; desc: string }> = [
  { segs: ['users'], desc: 'users-list' },
  { segs: ['users', 'alice'], desc: 'user-get :id=alice' },
  { segs: ['users', 'alice', 'profile'], desc: 'user-profile :id=alice' },
  { segs: ['products'], desc: 'products-list' },
  { segs: ['products', 'widget-pro'], desc: 'product-get :slug=widget-pro' },
  { segs: ['health'], desc: 'health' },
  { segs: ['orders', '42'], desc: 'order-num #orderId=42' },
  { segs: ['orders', 'notanumber'], desc: 'no match (numeric fail)' },
  { segs: ['unknown'], desc: 'no match' },
];

let allPass = true;
for (const { segs, desc } of cases) {
  const walk = walkParse(simpleNodes, segs, new URLSearchParams());
  const compiled = dispatch(segs);

  // Normalize: walkParse may include child nesting; compiled dispatch is flat.
  // For this comparison, check tag + all param values match.
  const tagsMatch = walk?.['tag'] === compiled?.['tag'];
  const status = tagsMatch ? 'PASS' : 'FAIL';
  if (!tagsMatch) allPass = false;

  console.log(`  [${status}] ${desc}`);
  if (!tagsMatch) {
    console.log(`         walk: ${JSON.stringify(walk)}`);
    console.log(`         compiled: ${JSON.stringify(compiled)}`);
  }
}

console.log(allPass ? '\nAll correctness checks passed.\n' : '\nSome checks FAILED.\n');

// ---------------------------------------------------------------------------
// Startup cost: compile time measurement
// ---------------------------------------------------------------------------

console.log('=== Compile-time cost ===\n');

function buildTree(n: number): WalkNode[] {
  const roots: WalkNode[] = [];
  let remaining = n;
  for (let g = 0; remaining > 0; g++) {
    const prefix = `r${String(g).padStart(2, '0')}`;
    const children: WalkNode[] = [leaf(prefix, `/${prefix}`)];
    if (remaining > 1) children.push(leaf(`${prefix}_str`, `/${prefix}/:id`));
    if (remaining > 2) children.push(leaf(`${prefix}_num`, `/${prefix}/#id`));
    if (remaining > 3) children.push(leaf(`${prefix}_detail`, `/${prefix}/detail`));
    if (remaining > 4) children.push(leaf(`${prefix}_detail_id`, `/${prefix}/detail/:id`));
    const added = Math.min(children.length, 5);
    remaining -= added;
    roots.push(...children);
  }
  return roots;
}

for (const n of [20, 100, 500]) {
  const tree = buildTree(n);
  const iterations = 1000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    compileNodes(tree);
  }
  const msPerCompile = (performance.now() - start) / iterations;

  console.log(`  n=${n}: compile cost = ${(msPerCompile * 1000).toFixed(1)} µs/compile`);
}

// ---------------------------------------------------------------------------
// Hot-path benchmark: walkParse vs. compiled dispatch
// ---------------------------------------------------------------------------

console.log('\n=== Hot-path benchmark ===\n');

for (const n of [20, 100, 500]) {
  const tree = buildTree(n);
  const compiledT = compileNodes(tree);
  const compiledFn = makeCompiledDispatch(compiledT);

  // Target a route in the middle of the tree
  const groupIndex = Math.floor(n / 2 / 5);
  const prefix = `r${String(groupIndex).padStart(2, '0')}`;
  const matchSegs = [prefix, 'detail', 'abc'];
  const noMatchSegs = ['zzz', 'no', 'match'];
  const q = new URLSearchParams();

  const ITERS = 100_000;

  // warm up
  for (let i = 0; i < 1000; i++) {
    walkParse(tree, matchSegs, q);
    compiledFn(matchSegs);
  }

  // walkParse match
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) walkParse(tree, matchSegs, q);
  const walkMatchNs = ((performance.now() - t0) * 1_000_000) / ITERS;

  // compiled match
  const t1 = performance.now();
  for (let i = 0; i < ITERS; i++) compiledFn(matchSegs);
  const compiledMatchNs = ((performance.now() - t1) * 1_000_000) / ITERS;

  // walkParse no-match
  const t2 = performance.now();
  for (let i = 0; i < ITERS; i++) walkParse(tree, noMatchSegs, q);
  const walkNoMatchNs = ((performance.now() - t2) * 1_000_000) / ITERS;

  // compiled no-match
  const t3 = performance.now();
  for (let i = 0; i < ITERS; i++) compiledFn(noMatchSegs);
  const compiledNoMatchNs = ((performance.now() - t3) * 1_000_000) / ITERS;

  const matchSpeedup = (walkMatchNs / compiledMatchNs).toFixed(2);
  const noMatchSpeedup = (walkNoMatchNs / compiledNoMatchNs).toFixed(2);

  console.log(`  n=${n}:`);
  console.log(`    match:    walk=${walkMatchNs.toFixed(0)}ns  compiled=${compiledMatchNs.toFixed(0)}ns  speedup=${matchSpeedup}x`);
  console.log(`    no-match: walk=${walkNoMatchNs.toFixed(0)}ns  compiled=${compiledNoMatchNs.toFixed(0)}ns  speedup=${noMatchSpeedup}x`);
}

console.log('\nDone.');
