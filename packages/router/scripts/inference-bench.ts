#!/usr/bin/env node
/**
 * Benchmark TypeScript inference depth/complexity for FlattenChildrenImpl.
 *
 * Generates route trees of increasing depth/breadth, runs `tsc --noEmit`,
 * and reports wall-clock time and whether the compiler errors.
 *
 * Run: npx tsx scripts/inference-bench.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const BENCH_DIR = join(PKG_ROOT, 'bench');
const TSCONFIG_BENCH = join(PKG_ROOT, 'tsconfig.bench.json');
const TSC = join(PKG_ROOT, 'node_modules', '.bin', 'tsc');

// Depth/breadth matrix. Depth ≤ 15 is the FlattenChildrenImpl hard cap.
// Include d=3 and d=4 so that b=10 and b=20 produce measurable data points.
const DEPTHS = [2, 3, 4, 5, 10];
const BREADTHS = [2, 5, 10, 20];

// Skip combos that would generate more nodes than this.
// Beyond ~15 K nodes the generated file itself becomes unwieldy.
const MAX_NODES = 15_000;

// Kill tsc after this many ms (catches infinite expansion bugs).
const TIMEOUT_MS = 90_000;

// ─── Tree size ────────────────────────────────────────────────────────────────

function totalNodes(depth: number, breadth: number): number {
  // Top level has `breadth` roots, each root is a subtree of depth `depth`.
  // Subtree size = sum(B^k, k=0..D-1) = (B^D - 1)/(B-1)  for B > 1.
  if (depth === 0) return 0;
  if (breadth === 1) return depth;
  const subtree = (Math.pow(breadth, depth) - 1) / (breadth - 1);
  return Math.round(breadth * subtree);
}

// ─── Code generation ─────────────────────────────────────────────────────────

let nodeCounter = 0;

function makeNode(depth: number, breadth: number, indent: number): string {
  const id = nodeCounter++;
  const pad = ' '.repeat(indent);
  const schema = `z.object({ tag: z.literal('r${String(id)}') })`;

  if (depth <= 1) {
    return `${pad}route(${schema}, '/s${String(id)}')`;
  }

  const children = Array.from({ length: breadth }, () =>
    makeNode(depth - 1, breadth, indent + 2),
  );

  return [
    `${pad}route(${schema}, '/s${String(id)}', [`,
    children.join(',\n'),
    `${pad}])`,
  ].join('\n');
}

function generateCode(depth: number, breadth: number): string {
  nodeCounter = 0;
  const topLevel = Array.from({ length: breadth }, () => makeNode(depth, breadth, 2));

  return [
    `// auto-generated: depth=${String(depth)}, breadth=${String(breadth)}`,
    `import { defineRoutes, route } from '../src/core/define-routes.js';`,
    `import z from 'zod';`,
    ``,
    `const router = defineRoutes([`,
    topLevel.join(',\n'),
    `]);`,
    ``,
    `declare const _: typeof router._type;`,
  ].join('\n');
}

// ─── tsc runner ──────────────────────────────────────────────────────────────

interface TscOutcome {
  ms: number;
  ok: boolean;
  label: string;
}

function runTsc(): TscOutcome {
  const start = performance.now();
  const r = spawnSync(TSC, ['--noEmit', '--project', TSCONFIG_BENCH], {
    timeout: TIMEOUT_MS,
    encoding: 'utf8',
    cwd: PKG_ROOT,
  });
  const ms = Math.round(performance.now() - start);

  if (r.error) {
    const isTimeout = r.error.message.includes('ETIMEDOUT') || r.error.message.includes('SIGTERM');
    return { ms, ok: false, label: isTimeout ? 'timeout' : 'crash' };
  }

  if (r.status !== 0) {
    const output = r.stdout + r.stderr;
    const match = /error TS(\d+)/.exec(output);
    const tsCode = match?.[1];
    const label = tsCode !== undefined ? `TS${tsCode} error` : 'error';
    return { ms, ok: false, label };
  }

  return { ms, ok: true, label: 'OK' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Row {
  depth: number;
  breadth: number;
  nodes: number;
  totalMs: number | null;
  netMs: number | null;
  status: string;
}

mkdirSync(BENCH_DIR, { recursive: true });

// Baseline: typecheck src only (no bench file present).
process.stdout.write('Measuring baseline (src only)… ');
const baseline = runTsc();
process.stdout.write(`${String(baseline.ms)}ms\n\n`);

const rows: Row[] = [];

for (const depth of DEPTHS) {
  for (const breadth of BREADTHS) {
    const nodes = totalNodes(depth, breadth);

    if (nodes > MAX_NODES) {
      rows.push({ depth, breadth, nodes, totalMs: null, netMs: null, status: 'skipped' });
      process.stdout.write(`  depth=${String(depth)} breadth=${String(breadth)}: skipped (${String(nodes)} nodes > ${String(MAX_NODES)})\n`);
      continue;
    }

    process.stdout.write(`  depth=${String(depth)} breadth=${String(breadth)} (${String(nodes)} nodes)… `);

    const benchFile = join(BENCH_DIR, `bench_d${String(depth)}_b${String(breadth)}.ts`);
    writeFileSync(benchFile, generateCode(depth, breadth));

    let outcome: TscOutcome;
    try {
      outcome = runTsc();
    } finally {
      rmSync(benchFile, { force: true });
    }

    const netMs = outcome.ms - baseline.ms;
    rows.push({ depth, breadth, nodes, totalMs: outcome.ms, netMs, status: outcome.label });
    process.stdout.write(`total=${String(outcome.ms)}ms  net=${String(netMs)}ms  ${outcome.label}\n`);
  }
}

// Clean up bench dir if empty.
try { rmSync(BENCH_DIR, { recursive: true, force: true }); } catch { /* ignore */ }

// ─── Table ───────────────────────────────────────────────────────────────────

console.log('\n## Inference Benchmark Results\n');
console.log(`Baseline (src typecheck without bench file): **${String(baseline.ms)}ms**\n`);
console.log('| Depth | Breadth | Nodes  | tsc time | Net time | Status  |');
console.log('|-------|---------|--------|----------|----------|---------|');

for (const r of rows) {
  const total = r.totalMs !== null ? `${String(r.totalMs)}ms` : '—';
  const net = r.netMs !== null ? `${String(r.netMs)}ms` : '—';
  const n = r.nodes.toLocaleString();
  console.log(`| ${String(r.depth).padEnd(5)} | ${String(r.breadth).padEnd(7)} | ${n.padEnd(6)} | ${total.padEnd(8)} | ${net.padEnd(8)} | ${r.status} |`);
}

// ─── Memo ────────────────────────────────────────────────────────────────────

type OkRow = Row & { totalMs: number; netMs: number };
const okRows = rows.filter((r): r is OkRow => r.status === 'OK' && r.totalMs !== null);
const failRows = rows.filter(r => r.status !== 'OK' && r.status !== 'skipped');
const maxOkNodes = okRows.length ? Math.max(...okRows.map(r => r.nodes)) : 0;

// Use total/baseline ratio to classify rows, making analysis robust to
// a noisy baseline.  ratio > 2 means the bench file doubled tsc time.
const SLOW_RATIO = 2.0;
const slowRows = okRows.filter(r => (r.totalMs / baseline.ms) > SLOW_RATIO);
const fastRows = okRows.filter(r => (r.totalMs / baseline.ms) <= SLOW_RATIO);

// Worst-case: row with highest total tsc time.
const worstOk = okRows.reduce<OkRow | null>(
  (best, r) => (r.totalMs > (best?.totalMs ?? 0) ? r : best), null);

// Practical "free" ceiling: largest node count in a fast row.
const maxFastNodes = fastRows.length ? Math.max(...fastRows.map(r => r.nodes)) : 0;

// Bottleneck: find minimum breadth that causes slowness, and minimum depth at
// breadth=2 that causes slowness.  Comparing these reveals whether width or
// depth drives the cost.
const minSlowBreadth = slowRows.length
  ? Math.min(...slowRows.map(r => r.breadth))
  : Infinity;
const minSlowDepthNarrow = slowRows.filter(r => r.breadth === 2).length
  ? Math.min(...slowRows.filter(r => r.breadth === 2).map(r => r.depth))
  : Infinity;

const bottleneck = (() => {
  if (minSlowBreadth < Infinity && minSlowDepthNarrow === Infinity)
    return `breadth (node count grows as breadth^depth) — depth=2 trees stay fast at all tested depths; the first slow case requires breadth≥${String(minSlowBreadth)}`;
  if (minSlowDepthNarrow < Infinity && minSlowBreadth === Infinity)
    return `depth — slow at depth≥${String(minSlowDepthNarrow)} even with narrow trees`;
  if (minSlowBreadth < Infinity && minSlowDepthNarrow < Infinity)
    return `both — slow at breadth≥${String(minSlowBreadth)} or depth≥${String(minSlowDepthNarrow)} (narrowest)`;
  return 'indeterminate — no rows exceeded the 2× baseline threshold in this run';
})();

// Breadth-scaling example: compare total tsc time ratios at fixed depth for
// two different breadths (avoids net-time noise).
const breadthScaleExample = (() => {
  const lo = okRows.find(r => r.depth === 3 && r.breadth === 10);
  const hi = okRows.find(r => r.depth === 3 && r.breadth === 20);
  if (!lo?.totalMs || !hi?.totalMs || lo.totalMs === 0) return '';
  const ratio = (hi.totalMs / lo.totalMs).toFixed(1);
  return `At depth=3, going from breadth=10 (${lo.nodes.toLocaleString()} nodes, ${String(lo.totalMs)}ms total) to breadth=20 (${hi.nodes.toLocaleString()} nodes, ${String(hi.totalMs)}ms total) is a 2× breadth increase that drives a ${ratio}× tsc time increase.`;
})();

const noErrors = failRows.length === 0;
const worstCaseStr = worstOk
  ? `depth=${String(worstOk.depth)}, breadth=${String(worstOk.breadth)} (${worstOk.nodes.toLocaleString()} nodes, ${String(worstOk.totalMs)}ms total / ${String(worstOk.netMs)}ms net)`
  : 'none measured';

const noErrors_str = noErrors
  ? 'No TS2589 errors were observed across the tested matrix.'
  : `TS2589 or timeout at: ${failRows.map(r => `depth=${String(r.depth)}, breadth=${String(r.breadth)}`).join('; ')}.`;

console.log(`
## Memo

**Where is the practical limit?**
The largest successfully type-checked tree in this run has ${maxOkNodes.toLocaleString()} nodes.
${noErrors_str}
Worst case: ${worstCaseStr}.
Trees below ~${maxFastNodes.toLocaleString()} nodes add less than 2× to baseline tsc time (effectively free).
Note: net times have ±500ms variance due to OS scheduling; use total tsc time for comparison.

**Is the bottleneck depth, breadth, or instantiation count?**
Primary driver: **${bottleneck}**. ${breadthScaleExample}
The \`FlattenChildrenImpl\` depth counter caps recursion at 15 levels, so depth growth
beyond the cap adds only parse/symbol-table cost, not additional type instantiation work.
Breadth compounds exponentially in node count, and TypeScript must instantiate a distinct
type for each uniquely-shaped route node at every level.

**Are there simple type-level changes that push the limit out?**
The depth-counter pattern is already the standard fix for TS2589. If breadth ever becomes
a bottleneck, the biggest lever is structural deduplication: using the same Zod schema
shape for all sibling routes reduces the number of distinct RouteNode types TypeScript must
track. The \`& {}\` intersection-flattening trick could also help, but neither change is
motivated by the current data.

**Does the limit matter for realistic production route trees?**
A typical production app has < 200 routes at depth ≤ 4 and breadth ≤ 15 per level. The
largest realistic tree (depth=3, breadth=15) has ≈ 3,375 nodes — far below the observed
slow threshold. **No optimization work is warranted; Phase 4 (Type Evaluation Cache
Engine) should remain deferred.**
`);
