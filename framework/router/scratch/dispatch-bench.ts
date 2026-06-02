/**
 * Plan 132 Spike — Dispatch Benchmark
 *
 * Compares walkParse() against a map-indexed dispatch (first-literal-segment bucket)
 * and a hand-written compiled switch at tree sizes: 20, 100, 500 routes.
 *
 * Run: tsx packages/router/scratch/dispatch-bench.ts
 */

import z from 'zod';
import { parseSegments } from '../src/core/segments.js';
import { walkParse, type WalkNode } from '../src/core/walk.js';

// ---------------------------------------------------------------------------
// Tree construction helpers
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

/**
 * Build a flat tree of `n` routes spread across `Math.ceil(n/5)` top-level
 * literal prefixes, each with up to 5 children (mix of literal, :str, #num).
 *
 * Shape for prefix "r00":
 *   /r00            (leaf)
 *   /r00/:id        (leaf)
 *   /r00/#id        (leaf)
 *   /r00/detail     (leaf)
 *   /r00/detail/:id (leaf)
 */
function buildTree(n: number): WalkNode[] {
  const roots: WalkNode[] = [];
  const groupSize = 5;
  let remaining = n;

  for (let g = 0; remaining > 0; g++) {
    const prefix = `r${String(g).padStart(2, '0')}`;
    const children: WalkNode[] = [];

    if (remaining > 1) children.push(leaf(`${prefix}_by_str_id`, `/:id`));
    if (remaining > 2) children.push(leaf(`${prefix}_by_num_id`, `/#id`));
    if (remaining > 3) children.push(leaf(`${prefix}_detail`, `/detail`));
    if (remaining > 4) children.push(leaf(`${prefix}_detail_id`, `/detail/:id`));

    const childCount = Math.min(children.length, groupSize - 1);
    remaining -= childCount + 1; // +1 for the root leaf itself

    roots.push(branch(`/${prefix}`, [
      leaf(prefix, `/${prefix}`),
      ...children.slice(0, childCount),
    ]));
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Map-indexed dispatch: O(1) first-literal-segment lookup
// ---------------------------------------------------------------------------

type DispatchMap = {
  literals: Map<string, WalkNode[]>;
  nonLiteral: WalkNode[];
};

function buildDispatchMap(nodes: WalkNode[]): DispatchMap {
  const literals = new Map<string, WalkNode[]>();
  const nonLiteral: WalkNode[] = [];

  for (const node of nodes) {
    const firstSeg = node.segments[0];
    if (firstSeg && firstSeg.kind === 'lit') {
      const bucket = literals.get(firstSeg.value);
      if (bucket) {
        bucket.push(node);
      } else {
        literals.set(firstSeg.value, [node]);
      }
    } else {
      nonLiteral.push(node);
    }
  }

  return { literals, nonLiteral };
}

function mapIndexedParse(
  map: DispatchMap,
  urlSegments: string[],
  query: URLSearchParams,
): Record<string, unknown> | null {
  const first = urlSegments[0];
  if (first !== undefined) {
    const bucket = map.literals.get(first);
    if (bucket) {
      const r = walkParse(bucket, urlSegments, query);
      if (r) return r;
    }
  }
  // Fall back to non-literal roots (params, wildcards)
  if (map.nonLiteral.length > 0) {
    return walkParse(map.nonLiteral, urlSegments, query);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hand-written compiled dispatch (generated closure, 20-route case only)
// ---------------------------------------------------------------------------

// Approximates what a compile step would emit for a 4-prefix tree:
//   /r00, /r00/:id, /r00/#id, /r00/detail, /r00/detail/:id
//   /r01 ...  /r02 ... /r03 ...
// (Identical pattern per group — demonstrates the shape, not exhaustive.)
function makeCompiledDispatch(prefixes: string[]): (segs: string[]) => Record<string, unknown> | null {
  // Build one switch arm per prefix — closed over `prefixes` array.
  return function compiledDispatch(segs: string[]): Record<string, unknown> | null {
    const p = segs[0];
    if (p === undefined) return null;

    for (const prefix of prefixes) {
      if (p !== prefix) continue;
      const s1 = segs[1];
      if (s1 === undefined) return { tag: prefix };
      if (s1 === 'detail') {
        const s2 = segs[2];
        if (s2 === undefined) return { tag: `${prefix}_detail` };
        return { tag: `${prefix}_detail_id`, id: s2 };
      }
      // numeric param
      const n = parseInt(s1, 10);
      if (!isNaN(n) && String(n) === s1) return { tag: `${prefix}_by_num_id`, id: n };
      // string param
      return { tag: `${prefix}_by_str_id`, id: s1 };
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Benchmark harness
// ---------------------------------------------------------------------------

interface BenchResult {
  name: string;
  n: number;
  iterPerRun: number;
  msTotal: number;
  nsPerOp: number;
}

function bench(
  name: string,
  n: number,
  fn: () => unknown,
  iterations = 100_000,
): BenchResult {
  // warm up
  for (let i = 0; i < 1000; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const msTotal = performance.now() - start;
  const nsPerOp = (msTotal * 1_000_000) / iterations;

  return { name, n, iterPerRun: iterations, msTotal, nsPerOp };
}

function urlFor(n: number): [string[], URLSearchParams] {
  // Target a route in the middle of the tree (worst-case for linear scan).
  const groupIndex = Math.floor(n / 2 / 5);
  const prefix = `r${String(groupIndex).padStart(2, '0')}`;
  return [[prefix, 'detail', 'abc123'], new URLSearchParams()];
}

function noMatchUrl(): [string[], URLSearchParams] {
  return [['zzz', 'no', 'match'], new URLSearchParams()];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const sizes = [20, 100, 500] as const;
const results: BenchResult[] = [];

console.log('Building route trees...');
for (const n of sizes) {
  const tree = buildTree(n);
  const actualCount = countRoutes(tree);
  const map = buildDispatchMap(tree);
  const prefixes = [...map.literals.keys()];
  const compiled = makeCompiledDispatch(prefixes);

  const [matchSegs, matchQuery] = urlFor(n);
  const [noMatchSegs, noMatchQuery] = noMatchUrl();

  // Verify correctness before benchmarking
  const walkResult = walkParse(tree, matchSegs, matchQuery);
  const mapResult = mapIndexedParse(map, matchSegs, matchQuery);
  if (!walkResult || !mapResult) {
    console.error(`CORRECTNESS FAIL at n=${n}: walkResult=${JSON.stringify(walkResult)}, mapResult=${JSON.stringify(mapResult)}`);
    process.exit(1);
  }
  if (JSON.stringify(walkResult) !== JSON.stringify(mapResult)) {
    console.error(`MISMATCH at n=${n}: walk=${JSON.stringify(walkResult)} map=${JSON.stringify(mapResult)}`);
    process.exit(1);
  }

  // No-match correctness
  const walkNoMatch = walkParse(tree, noMatchSegs, noMatchQuery);
  const mapNoMatch = mapIndexedParse(map, noMatchSegs, noMatchQuery);
  if (walkNoMatch !== null || mapNoMatch !== null) {
    console.error(`NO-MATCH FAIL at n=${n}: walk=${JSON.stringify(walkNoMatch)} map=${JSON.stringify(mapNoMatch)}`);
    process.exit(1);
  }

  console.log(`  n=${n} (actual routes: ${actualCount}): correctness OK`);

  // Benchmark — match case (middle of tree)
  results.push(bench(`walkParse match`, n, () => walkParse(tree, matchSegs, matchQuery)));
  results.push(bench(`map-indexed match`, n, () => mapIndexedParse(map, matchSegs, matchQuery)));

  // For n=20 only, include the compiled hand-written switch
  if (n === 20) {
    const compiledResult = compiled(matchSegs);
    if (!compiledResult) {
      console.error(`Compiled dispatch FAIL at n=20: returned null for ${matchSegs.join('/')}`);
    } else {
      results.push(bench(`compiled-switch match`, n, () => compiled(matchSegs)));
    }
  }

  // Benchmark — no-match case (linear scan worst-case)
  results.push(bench(`walkParse no-match`, n, () => walkParse(tree, noMatchSegs, noMatchQuery)));
  results.push(bench(`map-indexed no-match`, n, () => mapIndexedParse(map, noMatchSegs, noMatchQuery)));
}

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

console.log('\n--- Results ---');
console.log(
  ['Strategy'.padEnd(25), 'n'.padStart(5), 'ns/op'.padStart(12), 'speedup'].join('  '),
);
console.log('-'.repeat(65));

const groups = new Map<number, BenchResult[]>();
for (const r of results) {
  const g = groups.get(r.n) ?? [];
  g.push(r);
  groups.set(r.n, g);
}

for (const [n, group] of groups) {
  const baseline = group.find((r) => r.name.startsWith('walkParse match'));
  for (const r of group) {
    const speedup =
      baseline && r.name !== baseline.name
        ? `${(baseline.nsPerOp / r.nsPerOp).toFixed(2)}x`
        : '(baseline)';
    console.log(
      [
        r.name.padEnd(25),
        String(n).padStart(5),
        r.nsPerOp.toFixed(0).padStart(12),
        speedup,
      ].join('  '),
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Decision table summary
// ---------------------------------------------------------------------------

console.log('--- Decision table ---');
console.log('Routes  walkParse-match(ns)  map-indexed-match(ns)  speedup');
console.log('-'.repeat(65));
for (const n of sizes) {
  const g = groups.get(n) ?? [];
  const walk = g.find((r) => r.name === 'walkParse match')?.nsPerOp ?? 0;
  const map = g.find((r) => r.name === 'map-indexed match')?.nsPerOp ?? 0;
  const speedup = walk > 0 && map > 0 ? (walk / map).toFixed(2) : 'n/a';
  console.log(
    `${String(n).padStart(6)}  ${walk.toFixed(0).padStart(19)}  ${map.toFixed(0).padStart(21)}  ${speedup}x`,
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function countRoutes(nodes: WalkNode[]): number {
  let c = 0;
  for (const n of nodes) {
    if (n.schema !== null) c++;
    c += countRoutes(n.children as WalkNode[]);
  }
  return c;
}
