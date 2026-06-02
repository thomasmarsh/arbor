/**
 * Plan 87 Spike — Session Types Feasibility
 *
 * Validates: Dual<S>, Channel<S>, depth limits, _meta integration.
 * Not part of build. Run standalone:
 *   npx tsc --noEmit --diagnostics scratch/87-session-types.ts
 */

// ---------------------------------------------------------------------------
// 1. Session type primitives
// ---------------------------------------------------------------------------

type Send<T, S extends Session = End> = { readonly _tag: 'Send'; _payload: T; _next: S };
type Recv<T, S extends Session = End> = { readonly _tag: 'Recv'; _payload: T; _next: S };
type Branch<Cases extends Record<string, Session>> = { readonly _tag: 'Branch'; _cases: Cases };
type Select<Cases extends Record<string, Session>> = { readonly _tag: 'Select'; _cases: Cases };
type End = { readonly _tag: 'End' };
type Session = Send<any, any> | Recv<any, any> | Branch<any> | Select<any> | End;

// ---------------------------------------------------------------------------
// 2. Dual<S> — depth-counter implementation (avoids TS2589)
//
// FINDING: The naive recursive form below hits TS2589 ("Type instantiation is
// excessively deep and possibly infinite") because TypeScript's cycle detector
// sees Send<any,any> → Dual<any> → cycles on `any`. The depth-counter approach
// (identical to FlattenChildrenImpl used in the router core) resolves cleanly.
//
// Naive form that fails (documented for the record, NOT used):
//   type DualNaive<S extends Session> =
//     S extends Send<infer T, infer N extends Session> ? Recv<T, DualNaive<N>> : ...
// ---------------------------------------------------------------------------

type D = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

type Dual<S extends Session, Lim extends number = 15> =
  [Lim] extends [0] ? End :
  S extends Send<infer T, infer N extends Session> ? Recv<T, Dual<N, D[Lim]>> :
  S extends Recv<infer T, infer N extends Session> ? Send<T, Dual<N, D[Lim]>> :
  S extends Branch<infer C extends Record<string, Session>> ? Select<{ [K in keyof C]: Dual<C[K], D[Lim]> }> :
  S extends Select<infer C extends Record<string, Session>> ? Branch<{ [K in keyof C]: Dual<C[K], D[Lim]> }> :
  End;

// ---------------------------------------------------------------------------
// 3. Channel<S> — runtime handle typed by current session state
// ---------------------------------------------------------------------------

type Channel<S extends Session> =
  S extends Send<infer T, infer N extends Session> ? { send(v: T): Channel<N>; readonly _state: S } :
  S extends Recv<infer T, infer N extends Session> ? { recv(): Promise<readonly [T, Channel<N>]>; readonly _state: S } :
  S extends Branch<infer C extends Record<string, Session>> ? { branch<K extends keyof C>(k: K): Channel<C[K]>; readonly _state: S } :
  S extends Select<infer C extends Record<string, Session>> ? { select<K extends keyof C>(k: K): Channel<C[K]>; readonly _state: S } :
  S extends End ? { close(): void; readonly _state: S } :
  never;

// ---------------------------------------------------------------------------
// 4. Assertion helpers (compile-time only)
// ---------------------------------------------------------------------------

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
declare function assertType<_T extends true>(): void;

// ---------------------------------------------------------------------------
// 5. Dual correctness checks
// ---------------------------------------------------------------------------

// H1: Dual<Send<A, End>> → Recv<A, End>
type H1 = Dual<Send<string, End>>;
assertType<Equals<H1, Recv<string, End>>>();

// H2: Dual<Recv<A, End>> → Send<A, End>
type H2 = Dual<Recv<number, End>>;
assertType<Equals<H2, Send<number, End>>>();

// H3: Depth-3 chain
type ThreeLevelServer = Send<string, Recv<number, Send<boolean, End>>>;
type ThreeLevelClient = Dual<ThreeLevelServer>;
assertType<Equals<ThreeLevelClient, Recv<string, Send<number, Recv<boolean, End>>>>>();

// H4: Depth-5 chain
type FiveLevelServer = Send<1, Recv<2, Send<3, Recv<4, Send<5, End>>>>>;
type FiveLevelClient = Dual<FiveLevelServer>;
assertType<Equals<FiveLevelClient, Recv<1, Send<2, Recv<3, Send<4, Recv<5, End>>>>>>>();

// H5: Branch↔Select duality
type BranchServer = Branch<{ ok: Send<string, End>; err: Send<Error, End> }>;
type BranchClientExpected = Select<{ ok: Recv<string, End>; err: Recv<Error, End> }>;
type BranchClient = Dual<BranchServer>;
assertType<Equals<BranchClient, BranchClientExpected>>();

// H6: Dual is its own inverse (Dual<Dual<S>> ≡ S)
type DualOfDual = Dual<Dual<ThreeLevelServer>>;
assertType<Equals<DualOfDual, ThreeLevelServer>>();

// ---------------------------------------------------------------------------
// 6. Channel<S> typing checks
// ---------------------------------------------------------------------------

// Send channel exposes .send, transitions to next state
declare const sendCh: Channel<Send<string, End>>;
const afterSend: Channel<End> = sendCh.send('hello');
afterSend.close();

// Recv channel exposes .recv, transitions to next state
declare const recvCh: Channel<Recv<number, End>>;
recvCh.recv().then(([n, next]) => {
  const _n: number = n;
  next.close();
});

// Branch channel dispatches by key
declare const branchCh: Channel<Branch<{ ok: Send<string, End>; fail: Send<Error, End> }>>;
const okCh: Channel<Send<string, End>> = branchCh.branch('ok');
okCh.send('result').close();

// Negative checks: Send channel has no .recv; Recv channel has no .send
// @ts-expect-error — send channel should not expose .recv
sendCh.recv();
// @ts-expect-error — recv channel should not expose .send
recvCh.send(42);

// ---------------------------------------------------------------------------
// 7. _meta integration sketch
// ---------------------------------------------------------------------------

// Existing _meta types from the codebase
interface HttpContextData {
  method: string;
  path: string;
}

interface OpenApiCtxData {
  summary?: string;
  tags?: string[];
}

// SessionMeta slots into _meta alongside existing context data
interface SessionMeta<S extends Session> {
  sessionType: S;
  dualType: Dual<S>;
}

type CombinedMeta<S extends Session> = SessionMeta<S> & HttpContextData & OpenApiCtxData;

declare function extractSession<S extends Session>(meta: CombinedMeta<S>): S;
declare function extractHttp(meta: CombinedMeta<any>): HttpContextData;

// Both types independently recoverable; SessionMeta<S> does not widen S
declare const combinedMeta: CombinedMeta<ThreeLevelServer>;
const _session: ThreeLevelServer = extractSession(combinedMeta);
const _http: HttpContextData = extractHttp(combinedMeta);

type ExtractedSession = ReturnType<typeof extractSession<ThreeLevelServer>>;
assertType<Equals<ExtractedSession, ThreeLevelServer>>();

// ---------------------------------------------------------------------------
// 8. sessionRoute() sketch — mock factory showing _meta integration
// ---------------------------------------------------------------------------

interface RouteNode<R, C extends RouteNode<unknown, any, any, any>[] = [], Ctx = never, Meta = Record<string, unknown>> {
  _type: R;
  path: string;
  children: C;
  context?: Ctx;
  _meta?: Meta;
}

type SessionHandler<S extends Session> = (ch: Channel<S>) => Promise<void>;

function sessionRoute<S extends Session>(
  path: string,
  _sessionType: S,
  _handler: SessionHandler<S>,
): RouteNode<never, [], never, SessionMeta<S> & HttpContextData> {
  return { _type: undefined as never, path, children: [], _meta: undefined as any };
}

// Type inference flows from session type to handler parameter
const _echoRoute = sessionRoute(
  '/echo',
  {} as Send<string, Recv<string, End>>,
  async (ch) => {
    // ch: Channel<Send<string, Recv<string, End>>>
    const afterSend2 = ch.send('hello');
    // afterSend2: Channel<Recv<string, End>>
    const [reply, done] = await afterSend2.recv();
    const _reply: string = reply;
    done.close();
  },
);

type EchoMeta = NonNullable<typeof _echoRoute['_meta']>;
type EchoSessionType = EchoMeta['sessionType'];
assertType<Equals<EchoSessionType, Send<string, Recv<string, End>>>>();

// ---------------------------------------------------------------------------
// 9. Deep tree stress test (depth 8)
// ---------------------------------------------------------------------------

type Deep8 = Send<1, Recv<2, Send<3, Recv<4, Send<5, Recv<6, Send<7, Recv<8, End>>>>>>>>;
type Deep8Dual = Dual<Deep8>;
type Deep8Expected = Recv<1, Send<2, Recv<3, Send<4, Recv<5, Send<6, Recv<7, Send<8, End>>>>>>>>;
assertType<Equals<Deep8Dual, Deep8Expected>>();

// Dual<Dual<Deep8>> ≡ Deep8
type Deep8DualOfDual = Dual<Deep8Dual>;
assertType<Equals<Deep8DualOfDual, Deep8>>();
