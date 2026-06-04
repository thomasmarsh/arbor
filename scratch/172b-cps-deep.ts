/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spike 172b — CPS + Callback Injection: Making It Work
 *
 * Deepens the CPS phase encoding from 172-session-ergonomics.ts.
 * Progression across five parts:
 *
 *   Part 1 — Minimal correct CPS: Promise<never> + callback scoping
 *   Part 2 — Done token: must-advance enforced at compile time
 *   Part 3 — Phantom ledger: type-level proof accumulation (measurement)
 *   Part 4 — Runtime tracking HOC: stacked measurement where types fall short
 *   Part 5 — Indexed session monad: the ergonomic long-game
 *
 * Same lobby protocol as 172-session-ergonomics.ts throughout.
 */

// ─── Shared message types ─────────────────────────────────────────────────────

type JoinMsg       = { type: 'join'; username: string }
type WelcomeMsg    = { type: 'welcome'; roomId: string }  // eslint-disable-line @typescript-eslint/no-unused-vars
type FullMsg       = { type: 'full'; reason: string }     // eslint-disable-line @typescript-eslint/no-unused-vars
type ChatClientMsg = { type: 'chat'; text: string }
type LeaveMsg      = { type: 'leave' }
type ChatServerMsg = { type: 'chat'; author: string; text: string }
type ByeMsg        = { type: 'bye' }                      // eslint-disable-line @typescript-eslint/no-unused-vars

declare function checkCapacity(): boolean

// =============================================================================
// PART 1 — Minimal correct CPS
// =============================================================================
//
// Three structural guarantees fall out of the shape alone:
//
//   a) ChatAPI is scoped to the withChat callback — no field can hold a reference.
//
//   b) decide.full returns Promise<never>.  When the caller writes
//      `return decide.full(...)`, TypeScript's control flow analysis marks every
//      subsequent statement in that branch as unreachable.  This is the same
//      narrowing you get from `throw` — it's a type-level terminal.
//
//   c) The generic R parameter forces both branches to produce the same type.
//      If one branch returns a string and the other a number, the compiler
//      rejects the handler without any additional machinery.

interface ChatAPI_v1 {
  readonly messages: AsyncIterable<ChatClientMsg | LeaveMsg>
  sendChat(author: string, text: string): void
  sendBye(): void
  close(): void
}

interface LobbyCPS_v1 {
  handle<R>(k: (
    join: JoinMsg,
    decide: {
      welcome(roomId: string, withChat: (chat: ChatAPI_v1) => Promise<R>): Promise<R>
      full(reason: string): Promise<never>
    }
  ) => Promise<R>): Promise<R>
}

declare const lobby_v1: LobbyCPS_v1

async function handleLobby_v1(): Promise<void> {
  return lobby_v1.handle(async (join, decide) => {
    if (checkCapacity()) return decide.full('room at capacity')
    //                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //  Promise<never> is assignable to any Promise<R>.
    //  The `return` makes everything after this line dead — TypeScript knows.

    return decide.welcome('r1', async (chat) => {
      //                         ^^^^ ChatAPI_v1 lives only inside this callback.
      //                              It cannot be stored in an outer variable.
      for await (const msg of chat.messages) {
        if (msg.type === 'leave') { chat.sendBye(); chat.close(); return }
        chat.sendChat(join.username, msg.text)
        //            ^^^^^^^^^^^^ closure over `join` is fine
      }
    })
  })
}

// What v1 enforces:
// ✓ ChatAPI scoped to callback — no escape
// ✓ Terminal branch narrows away: code after `return decide.full(...)` is dead
// ✓ Both branches must produce same R
// ✗ Must-advance: `async (join, decide) => {}` compiles (implicit void != never, but void != R either)
//   Actually: for R=void the handler CAN return without calling anything. The gap is R=void.
// ✗ Double-advance: decide.full(...) then decide.welcome(...) both compile

// =============================================================================
// PART 2 — Done token: must-advance at compile time
// =============================================================================
//
// Make the handler return type unforgeable so implicit return is a compile error.
//
// `declare const _done: unique symbol` creates a value whose type (`typeof _done`)
// is nominally opaque.  Only code that can see `_done` directly — the module
// containing the implementation — can produce a value of that type.
// Callers CAN ONLY obtain Done by going through decide.full() or decide.welcome().
//
// The same token gates the chat callback: sendBye() returns Done, marking clean
// protocol completion.  The `done` parameter covers the loop-exhausted path
// (peer disconnected — also a valid terminal).
//
// Relationship to codensity / Effect<A>:
//   Effect<A> = (send: A → void) → IO.  The caller must provide a continuation
//   and cannot "escape" with A without going through `send`.  Done is the same
//   idea: the handler must produce Done, and the only path to Done is through
//   the provided respond methods.  The unique symbol is the TypeScript
//   approximation of `forall r. r` — a type with no public inhabitants.

declare const _done: unique symbol
type Done = typeof _done

interface ChatAPI_v2 {
  readonly messages: AsyncIterable<ChatClientMsg | LeaveMsg>
  sendChat(author: string, text: string): void
  sendBye(): Done   // returns Done — marks clean chat termination
  close(): void
}

interface LobbyCPS_v2 {
  handle(k: (
    join: JoinMsg,
    decide: {
      welcome(
        roomId: string,
        //  ↓ chatHandler must return Promise<Done> — only via sendBye or done param
        withChat: (chat: ChatAPI_v2, done: Done) => Promise<Done>
      ): Promise<Done>
      full(reason: string): Promise<Done>
    }
  ) => Promise<Done>): Promise<void>
}

declare const lobby_v2: LobbyCPS_v2

async function handleLobby_v2(): Promise<void> {
  return lobby_v2.handle(async (join, decide) => {
    if (checkCapacity()) return decide.full('room at capacity')

    return decide.welcome('r1', async (chat, done) => {
      for await (const msg of chat.messages) {
        if (msg.type === 'leave') {
          chat.close()
          return chat.sendBye()   // Done from sendBye — clean exit
        }
        chat.sendChat(join.username, msg.text)
      }
      return done   // Done from param — loop exhausted (peer disconnected)
    })
  })
}

// This fails to compile — implicit return gives void, not Done:
//
//   lobby_v2.handle(async (join, decide) => {})
//   //              ~~~~~~~~~~~~~~~~~~~~~~~~~~
//   // Type 'void' is not assignable to type 'typeof _done'.
//
// What v2 adds:
// ✓ Must-advance: implicit return is a compile error
// ✓ Chat must terminate cleanly: only sendBye() or done-param produce Done
// ✗ Double-advance: decide.full(r) then decide.welcome(r2, ...) still compiles.
//   Implementation handles it (close on first call), but types don't prevent it.

// =============================================================================
// PART 3 — Phantom ledger: type-level proof accumulation
// =============================================================================
//
// Rather than PREVENTING violations, we ACCUMULATE PROOF that certain steps
// occurred.  Each brand is an unforgeable intersection on the ledger type.
// Operations are gated on what the ledger does/doesn't prove.
//
// This is measurement, not enforcement — more like a proof-of-work than a lock.
//
// Why "stacked"?  The ledger grows by intersection: {} → {} & Joined → {} & Joined & Decided.
// Each step adds a layer.  We can query any layer from outside.

// ─── Ledger brands ───────────────────────────────────────────────────────────

declare const _joined:   unique symbol
declare const _decided:  unique symbol
declare const _chatDone: unique symbol

type L_Joined    = { readonly [_joined]: true }
type L_Decided   = { readonly [_decided]: true }
type L_ChatDone  = { readonly [_chatDone]: true }

// Helpers
type Extend<L, B> = L & B

// Does ledger L prove brand B?
type Proves<L, B> = L extends B ? true : false

// Gate: produce T only if L does NOT yet prove B (prevent double-use)
type Unless<L, B, T> = Proves<L, B> extends true ? never : T

// ─── CPS with ledger threading ───────────────────────────────────────────────
//
// The handler is parameterised over the initial ledger L.
// Each respond method returns a ledger extended with what it proved.
// The handler's return type requires proof that SOME advance was taken.

interface LobbyCPS_v3<L extends object> {
  handle(k: (
    join: JoinMsg,
    //   ↑ receiving join extends the ledger with L_Joined
    ledger: Extend<L, L_Joined>,
    decide: {
      // welcome and full are only available if ledger doesn't yet prove L_Decided
      welcome: Unless<L, L_Decided,
        (roomId: string,
         withChat: (
           chat: ChatAPI_v2,
           ledger: Extend<L, L_Joined & L_Decided>,
           done: Done
         ) => Promise<[Done, Extend<L, L_Joined & L_Decided & L_ChatDone>]>
        ) => Promise<[Done, Extend<L, L_Joined & L_Decided & L_ChatDone>]>
      >
      full: Unless<L, L_Decided,
        (reason: string,
         ledger: Extend<L, L_Joined>
        ) => Promise<[Done, Extend<L, L_Joined & L_Decided>]>
      >
    }
  ) => Promise<[Done, Extend<L, L_Joined & L_Decided>]>): Promise<void>
}

// ─── Handler with ledger threading ───────────────────────────────────────────

declare const lobby_v3: LobbyCPS_v3<{}>

async function handleLobby_v3(): Promise<void> {
  return lobby_v3.handle(async (join, ledger, decide) => {
    // ledger: {} & L_Joined
    // decide.welcome: function  (L={} doesn't prove L_Decided)
    // decide.full:    function  (L={} doesn't prove L_Decided)

    if (checkCapacity()) {
      return decide.full('room at capacity', ledger)
      //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      //     Returns Promise<[Done, {} & L_Joined & L_Decided]>
      //     Ledger now proves L_Joined & L_Decided — visible to caller of handle()
    }
    return decide.welcome('r1', async (chat, chatLedger, done) => {
      // chatLedger: {} & L_Joined & L_Decided — proofs stacked on the type
      for await (const msg of chat.messages) {
        if (msg.type === 'leave') {
          chat.close()
          return [chat.sendBye(), chatLedger as Extend<typeof chatLedger, L_ChatDone>]
          //                      ^^^ cast needed; impl would inject the extended ledger
        }
        chat.sendChat(join.username, msg.text)
      }
      return [done, chatLedger as Extend<typeof chatLedger, L_ChatDone>]
    })
  })
}

// ─── Querying the ledger from outside ────────────────────────────────────────
//
// The caller of handle() can constrain the result's ledger.
// This lets outer code assert that inner protocol steps happened.

async function withLobbyAssertion(): Promise<void> {
  // TypeScript verifies at compile time that the result proves L_Decided.
  // If the handler never calls full or welcome, the return type won't contain
  // L_Decided, and the assignment below would be a type error.
  const [, finalLedger] = await new Promise<[Done, object & L_Joined & L_Decided]>((resolve) => {
    lobby_v3.handle(async (join, ledger, decide) => {
      const result = checkCapacity()
        ? decide.full('full', ledger)
        : decide.welcome('r1', async (chat, cl, done) => {
            // Simplified: immediately close
            return [done, cl as Extend<typeof cl, L_ChatDone>]
          })
      const r = await result
      resolve(r)
      return r
    })
  })
  // finalLedger is typed as {} & L_Joined & L_Decided — provable at compile time
  const _: L_Decided = finalLedger   // ← this line would fail if L_Decided wasn't in the type
  void _
}

// ─── Ledger limitations ───────────────────────────────────────────────────────
//
// What the ledger CANNOT prevent:
//
//   1. Double-advance: calling decide.full(ledger) and then decide.welcome(ledger)
//      both compile because `ledger` still has type Extend<L, L_Joined> after
//      the first call.  TypeScript doesn't narrow the type of a variable based
//      on a function call that "consumes" it.  True affine/linear types would
//      solve this; TypeScript doesn't have them.
//
//   2. Forged ledger extension: `{} as L_Joined & L_Decided` is possible with a
//      cast.  The brands are soft guarantees, not hard isolation.
//
//   3. Reordering: nothing prevents calling decide methods before reading join,
//      since join is already bound in the callback parameter.
//
// What the ledger CAN do:
//
//   1. Prove at the call site that certain steps were completed — the return type
//      is a proof artifact.  Outer code can require proof before proceeding.
//
//   2. Gate downstream operations: Unless<L, L_Decided, T> = never blocks methods
//      on sessions that were TYPED as L_Decided from the start.  This works for
//      code that explicitly creates LobbyCPS_v3<AlreadyDecided> — e.g., a test
//      helper that wants to verify that calling welcome on a decided session fails.
//
//   3. Serve as structured audit log: the accumulated ledger type tells the
//      reader exactly which protocol steps the handler CLAIMS to have taken,
//      verified by the implementation's token injection.

// =============================================================================
// PART 4 — Runtime tracking HOC
// =============================================================================
//
// Compile-time cannot enforce linearity.  Runtime can observe and record.
// withProtocolTracking wraps a LobbyCPS_v2, intercepts every method call,
// emits a ProtocolEvent, and detects violations immediately.
//
// The HOC IS the "inner higher-order combinator that threads through stacked
// tracking" — it wraps the API surface with observability at every layer:
// handshake, decide, chat, send, close.

type ProtocolEvent =
  | { kind: 'recv_join';     username: string; ts: number }
  | { kind: 'decide_full';   reason: string;   ts: number }
  | { kind: 'decide_welcome';roomId: string;   ts: number }
  | { kind: 'send_chat';     author: string;   ts: number }
  | { kind: 'send_bye';                        ts: number }
  | { kind: 'chat_end';                        ts: number }

type ProtocolViolation =
  | { kind: 'double_advance'; first: 'full' | 'welcome'; second: 'full' | 'welcome' }
  | { kind: 'no_advance' }
  | { kind: 'send_after_bye' }

interface ProtocolTrace {
  readonly events: ProtocolEvent[]
  readonly violations: ProtocolViolation[]
}

function withProtocolTracking(inner: LobbyCPS_v2): {
  handle(k: Parameters<LobbyCPS_v2['handle']>[0]): Promise<ProtocolTrace>
} {
  return {
    async handle(k) {
      const events: ProtocolEvent[] = []
      const violations: ProtocolViolation[] = []
      let advanced: 'full' | 'welcome' | null = null
      let byeSent = false

      function emit(e: ProtocolEvent): void { events.push(e) }
      function violate(v: ProtocolViolation): void { violations.push(v) }

      await inner.handle(async (join, decide) => {
        emit({ kind: 'recv_join', username: join.username, ts: Date.now() })

        const trackedDecide: typeof decide = {
          async full(reason) {
            if (advanced !== null) violate({ kind: 'double_advance', first: advanced, second: 'full' })
            advanced = 'full'
            emit({ kind: 'decide_full', reason, ts: Date.now() })
            return decide.full(reason)
          },
          async welcome(roomId, withChat) {
            if (advanced !== null) violate({ kind: 'double_advance', first: advanced, second: 'welcome' })
            advanced = 'welcome'
            emit({ kind: 'decide_welcome', roomId, ts: Date.now() })
            return decide.welcome(roomId, async (chat, done): Promise<Done> => {
              const trackedChat: ChatAPI_v2 = {
                messages: chat.messages,
                sendChat(author, text) {
                  if (byeSent) violate({ kind: 'send_after_bye' })
                  emit({ kind: 'send_chat', author, ts: Date.now() })
                  chat.sendChat(author, text)
                },
                sendBye() {
                  byeSent = true
                  emit({ kind: 'send_bye', ts: Date.now() })
                  return chat.sendBye()
                },
                close: chat.close,
              }
              const result: Done = await withChat(trackedChat, done) as Done
              emit({ kind: 'chat_end', ts: Date.now() })
              return result
            })
          },
        }

        return k(join, trackedDecide)
      })

      if (advanced === null) violate({ kind: 'no_advance' })
      return { events, violations }
    },
  }
}

// The HOC composes: you can stack multiple trackers.
// Each layer wraps the one below without modifying the inner interface.
//
//   withProtocolTracking(withLatencyTracking(withAuthTracking(rawLobby)))
//
// Each wrapper injects its own ProtocolEvent variants.  The trace arrays
// accumulate independently.  This is the "stacked tracking" idea:
// each combinator adds a LAYER of observation without knowing about others.

// =============================================================================
// PART 5 — Indexed Session Monad: the ergonomic direction
// =============================================================================
//
// The deep CPS nesting in v1–v3 (decide.welcome('r1', async (chat, done) => {
//   for await (...) { ... }
// })) is correct but nested.  For long protocols, the nesting compounds.
//
// The ergonomic solution: an indexed monad `IxSession<Before, After, A>` where
// `.then()` sequences state transitions and the compiler verifies that the
// output state of one step matches the input state of the next.
//
// This is the CPS flip turned into a builder: instead of passing callbacks,
// you chain `.then()` calls.  The session type (Before/After) flows automatically.
//
// Relationship to Effect<A>:
//   Effect<A> = (send: A → void) → IO
//   IxSession<S, T, A> = (k: A → IxSession<T, T, Done>) → IxSession<S, T, Done>
//   The indexed parameter is what Effect<A> lacks — Effect tracks the value A
//   but not the protocol state S→T transition.

// ─── The type ─────────────────────────────────────────────────────────────────

// Session state labels (phantom — no runtime values)
type S_Handshake = 'handshake'
type S_Chat      = 'chat'
type S_Done      = 'done'

// IxSession<Before, After, A>:
//   Represents a protocol computation that transitions the session from
//   state Before to state After and yields value A.
//
// Implementation: CPS under the hood.
// The runner takes a "rest of program" continuation and calls it with A
// once the current step completes, threading the session state.

class IxSession<_Before, _After, A> {
  // Phantom types _Before and _After are never used at runtime.
  constructor(private readonly _run: <R>(k: (a: A) => Promise<R>) => Promise<R>) {}

  // Monadic bind: sequence this step with the next.
  // TypeScript enforces that the output state of `this` matches the input
  // state of `f`'s result, because they share the same _After / _Before type.
  then<NewAfter, B>(
    f: (a: A) => IxSession<_After, NewAfter, B>
  ): IxSession<_Before, NewAfter, B> {
    return new IxSession((k) => this._run((a) => f(a)._run(k)))
  }

  // Run the session, providing a terminal continuation.
  run(): Promise<A> {
    return this._run((a) => Promise.resolve(a))
  }

  // Lift a plain value into a no-op session (state unchanged).
  static of<S, A>(a: A): IxSession<S, S, A> {
    return new IxSession((k) => k(a))
  }
}

// ─── Primitive operations ──────────────────────────────────────────────────────
//
// Each operation is a factory that returns an IxSession with the correct state
// transition.  The types prevent sequencing steps in the wrong order.

// Receive the join message (Handshake → still Handshake, now we have the JoinMsg)
declare function recvJoin(): IxSession<S_Handshake, S_Handshake, JoinMsg>

// Send welcome: transitions Handshake → Chat
declare function sendWelcome(roomId: string): IxSession<S_Handshake, S_Chat, void>

// Send full: transitions Handshake → Done (terminal)
declare function sendFull(reason: string): IxSession<S_Handshake, S_Done, void>

// Receive one chat message (Chat → Chat)
declare function recvChat(): IxSession<S_Chat, S_Chat, ChatClientMsg | LeaveMsg>

// Send a chat message (Chat → Chat)
declare function sendChatMsg(msg: ChatServerMsg): IxSession<S_Chat, S_Chat, void>

// Send bye: transitions Chat → Done
declare function sendBye(): IxSession<S_Chat, S_Done, void>

// ─── Handler using the indexed monad ─────────────────────────────────────────
//
// Each `.then()` call threads the state.  TypeScript rejects wrong orderings:
//   sendWelcome(...).then(() => recvJoin())  // ERROR: S_Chat is not S_Handshake
//   sendBye().then(() => recvChat())         // ERROR: S_Done is not S_Chat

function lobbySession(): IxSession<S_Handshake, S_Done, void> {
  return recvJoin().then((join) =>
    checkCapacity()
      ? sendFull('room at capacity')   // IxSession<S_Handshake, S_Done, void>
      : sendWelcome('r1').then(() => chatLoop(join.username))
  )
}

function chatLoop(username: string): IxSession<S_Chat, S_Done, void> {
  return recvChat().then((msg) => {
    if (msg.type === 'leave') {
      return sendBye()   // IxSession<S_Chat, S_Done, void> — terminates
    }
    return sendChatMsg({ type: 'chat', author: username, text: msg.text })
      .then(() => chatLoop(username))  // IxSession<S_Chat, S_Done, void> — loops
  })
}

// The compiler verifies:
// ✓ recvJoin  only before decide (S_Handshake → S_Handshake)
// ✓ sendWelcome/sendFull only at S_Handshake (would be S_Chat otherwise → error)
// ✓ recvChat/sendChatMsg only at S_Chat
// ✓ sendBye only at S_Chat → S_Done
// ✓ No step is possible after S_Done (no operations declared with S_Done as Before)
//
// The handler composition is flat (.then chains) instead of nested callbacks.
// Ergonomics are close to async/await at the cost of explicit state labels.

// ─── IxSession limitations ────────────────────────────────────────────────────
//
// 1. Linearity: `.run()` can be called multiple times on the same IxSession.
//    The session object is not consumed.  The phantom types track logical state,
//    not ownership.
//
// 2. Runtime construction of IxSession objects escapes type tracking — an
//    `new IxSession(...)` with wrong phantom types will compile if you cast.
//
// 3. Branch/Select: the checkCapacity() branch above uses a ternary that returns
//    both IxSession<S_Handshake, S_Done, void> variants, which works because the
//    output type is the same.  For protocols where DIFFERENT branches have DIFFERENT
//    output states, you'd need a union: IxSession<S_Handshake, S_Done | S_Error, void>.
//    This propagates union states through subsequent `.then()` chains, which TypeScript
//    handles via conditional types but makes the types verbose.

// =============================================================================
// SYNTHESIS
// =============================================================================
//
// Which technique for which job:
//
// ┌─────────────────────────────┬───────────────────────────────────────────┐
// │ Technique                   │ What it enforces                          │
// ├─────────────────────────────┼───────────────────────────────────────────┤
// │ Promise<never> (Part 1)     │ Terminal branches are dead code           │
// │                             │ Both branches must return same R          │
// ├─────────────────────────────┼───────────────────────────────────────────┤
// │ Done token (Part 2)         │ Handler MUST call full or welcome         │
// │ (unique symbol)             │ Chat MUST end via sendBye or done param   │
// ├─────────────────────────────┼───────────────────────────────────────────┤
// │ Phantom ledger (Part 3)     │ Return type proves steps were taken       │
// │ (intersection brands)       │ Gates downstream operations on proof      │
// │                             │ ✗ Does NOT prevent double-advance         │
// ├─────────────────────────────┼───────────────────────────────────────────┤
// │ Runtime HOC (Part 4)        │ Detects all violations at runtime         │
// │                             │ Stackable — each layer adds a trace       │
// │                             │ ✗ Not a compile-time guarantee            │
// ├─────────────────────────────┼───────────────────────────────────────────┤
// │ Indexed session monad (Pt5) │ Step ORDERING enforced by state labels    │
// │                             │ Flat .then() chains instead of nesting    │
// │                             │ ✗ Linearity still not enforced            │
// └─────────────────────────────┴───────────────────────────────────────────┘
//
// The recommended production stack:
//
//   IxSession<Before, After, A>  — structural ordering guarantee (the type)
//   + Done token                 — must-terminate guarantee (the spine)
//   + withProtocolTracking HOC   — linearity / double-advance at runtime
//
// These compose: the HOC wraps any IxSession runner; the Done token flows through
// the indexed steps via the continuation.  The phantom ledger (Part 3) is most
// useful as a proof-at-the-boundary pattern — the return type of handle() can
// carry ledger proof that downstream code asserts against.
//
// What TypeScript fundamentally cannot enforce without language changes:
//   - Linear use (use-exactly-once) of channel/phase objects
//   - Affine use (use-at-most-once)
//   - Preventing capture and reuse of "spent" continuation values
//
// For these, the Done token + runtime HOC is the closest practical approximation.

export {}
