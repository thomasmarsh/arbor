/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spike 172 — Session Channel Ergonomics
 *
 * Compares four encoding strategies for a typed multi-step WebSocket protocol.
 * No production changes; `as any` casts are permitted throughout.
 *
 * Protocol under test — Lobby:
 *   1. Client → Server: { type: 'join'; username: string }
 *   2. Server → Client: { type: 'welcome'; roomId: string }
 *                    OR { type: 'full'; reason: string }
 *   3a. If welcome — bidirectional chat loop until client leaves:
 *         Client → Server: { type: 'chat'; text: string } | { type: 'leave' }
 *         Server → Client: { type: 'chat'; author: string; text: string } | { type: 'bye' }
 *   3b. If full: connection ends
 */

// ─── Session primitives (mirrored inline from src/core/session.ts) ──────────

interface Send<T, S extends Session = End> { readonly _tag: 'Send'; _payload: T; _next: S }
interface Recv<T, S extends Session = End> { readonly _tag: 'Recv'; _payload: T; _next: S }
interface Branch<Cases extends Record<string, Session>> { readonly _tag: 'Branch'; _cases: Cases }
interface Select<Cases extends Record<string, Session>> { readonly _tag: 'Select'; _cases: Cases }
interface End { readonly _tag: 'End' }
type Session = Send<any, any> | Recv<any, any> | Branch<any> | Select<any> | End

// ─── Protocol message types ───────────────────────────────────────────────────

type JoinMsg       = { type: 'join'; username: string }
type WelcomeMsg    = { type: 'welcome'; roomId: string }
type FullMsg       = { type: 'full'; reason: string }
type ChatClientMsg = { type: 'chat'; text: string }
type LeaveMsg      = { type: 'leave' }
type ChatServerMsg = { type: 'chat'; author: string; text: string }
type ByeMsg        = { type: 'bye' }

declare function checkCapacity(): boolean

// =============================================================================
// ENCODING A — Full state-threading (Channel<S>)
// =============================================================================
//
// The session type precisely encodes message order. Each operation returns
// Channel<NextState> — the compiler tracks protocol position via the type
// parameter. Both handler and client are typed against their side's session type.
//
// KEY CHANGE vs src/core/session.ts Channel<Select<C>>:
//   existing: { select<K>(k: K): Channel<C[K]> }  ← caller picks k (wrong direction)
//   proposed: { choose(): Promise<ChoiceResultA<C>> }  ← server awaits client's tag
//
// choose() resolves to a discriminated union on `tag`. Narrowing on tag also
// narrows the return type of pick(), so the compiler enforces correct branching.

type ChoiceResultA<C extends Record<string, Session>> = {
  [K in keyof C]: { tag: K; pick(): ChannelA<C[K]> }
}[keyof C]

type ChannelA<S extends Session> =
  S extends Send<infer T, infer N extends Session>   ? { send(v: T): ChannelA<N> }                         :
  S extends Recv<infer T, infer N extends Session>   ? { recv(): Promise<readonly [T, ChannelA<N>]> }       :
  S extends Branch<infer C extends Record<string, Session>> ? {
    // Holder sends its chosen tag to peer, then advances to C[K].
    branch<K extends keyof C>(k: K): ChannelA<C[K]>
  } :
  S extends Select<infer C extends Record<string, Session>> ? {
    // Holder awaits peer's tag; discriminated union on `tag` narrows pick().
    choose(): Promise<ChoiceResultA<C>>
  } :
  S extends End ? { close(): void } :
  never

// ─── Session type — server perspective ───────────────────────────────────────

type ChatLoopA = Select<{
  chat:  Recv<ChatClientMsg, Send<ChatServerMsg, ChatLoopA>>
  leave: Recv<LeaveMsg, Send<ByeMsg, End>>
}>

type LobbySessionA = Recv<JoinMsg, Branch<{
  welcome: Send<WelcomeMsg, ChatLoopA>
  full:    Send<FullMsg, End>
}>>

// ─── Server handler ───────────────────────────────────────────────────────────

declare function makeServerChannelA(adapter: unknown): ChannelA<LobbySessionA>

async function handleLobbyA(ch: ChannelA<LobbySessionA>): Promise<void> {
  const [join, ch1] = await ch.recv()
  //    ^JoinMsg  ^ChannelA<Branch<{welcome:..., full:...}>>

  if (checkCapacity()) {
    ch1.branch('full')                                   // key constrained to 'welcome' | 'full'
       .send({ type: 'full', reason: 'room at capacity' }) // payload constrained to FullMsg
       .close()
    return
  }

  const ch2 = ch1.branch('welcome').send({ type: 'welcome', roomId: 'r1' })
  //    ^ChannelA<ChatLoopA>
  await chatLoopA(ch2, join.username)
}

async function chatLoopA(ch: ChannelA<ChatLoopA>, username: string): Promise<void> {
  const choice = await ch.choose()
  //    ^{ tag: 'chat'; pick(): ChannelA<Recv<ChatClientMsg, ...>> }
  //   | { tag: 'leave'; pick(): ChannelA<Recv<LeaveMsg, ...>> }

  if (choice.tag === 'leave') {
    // Narrowed: { tag: 'leave'; pick(): ChannelA<Recv<LeaveMsg, Send<ByeMsg, End>>> }
    const [, ch2] = await choice.pick().recv()
    ch2.send({ type: 'bye' }).close()
    return
  }
  // Narrowed: { tag: 'chat'; pick(): ChannelA<Recv<ChatClientMsg, Send<ChatServerMsg, ChatLoopA>>> }
  const [msg, ch2] = await choice.pick().recv()
  //    ^ChatClientMsg
  const ch3 = ch2.send({ type: 'chat', author: username, text: msg.text })
  //    ^ChannelA<ChatLoopA>  — loops back to the same state
  await chatLoopA(ch3, username)
}

// ─── Session type — client perspective (= Dual<LobbySessionA>) ───────────────
//
// Branch<C> ↔ Select<C> under Dual:
//   client's ChannelA<Select<...>> = choose()  (receives server's branch tag)
//   client's ChannelA<Branch<...>> = branch()  (sends client's chosen tag)

type ClientChatLoopA = Branch<{
  chat:  Send<ChatClientMsg, Recv<ChatServerMsg, ClientChatLoopA>>
  leave: Send<LeaveMsg, Recv<ByeMsg, End>>
}>

type ClientSessionA = Send<JoinMsg, Select<{
  welcome: Recv<WelcomeMsg, ClientChatLoopA>
  full:    Recv<FullMsg, End>
}>>

// ─── Client call-site ─────────────────────────────────────────────────────────

declare function makeClientChannelA(adapter: unknown): ChannelA<ClientSessionA>

async function lobbyClientA(ch: ChannelA<ClientSessionA>): Promise<void> {
  const ch1 = ch.send({ type: 'join', username: 'alice' })
  //              ^JoinMsg enforced
  //    ch1: ChannelA<Select<{welcome:..., full:...}>>

  const response = await ch1.choose()
  //    ^{ tag: 'welcome'; pick(): ChannelA<Recv<WelcomeMsg, ClientChatLoopA>> }
  //   | { tag: 'full'; pick(): ChannelA<Recv<FullMsg, End>> }

  if (response.tag === 'full') {
    const [msg, ch2] = await response.pick().recv()
    //    ^FullMsg
    console.log('room full:', msg.reason)
    ch2.close()
    return
  }
  const [welcome, ch2] = await response.pick().recv()
  //    ^WelcomeMsg
  console.log('joined room:', welcome.roomId)
  await clientChatA(ch2)
}

async function clientChatA(ch: ChannelA<ClientChatLoopA>): Promise<void> {
  // ch: ChannelA<Branch<{chat: Send<...>, leave: Send<...>}>>
  const ch1 = ch.branch('chat').send({ type: 'chat', text: 'hello!' })
  //              ^'chat' constrained to 'chat' | 'leave'
  //                            ^ChatClientMsg enforced
  //    ch1: ChannelA<Recv<ChatServerMsg, ClientChatLoopA>>
  const [reply, ch2] = await ch1.recv()
  //    ^ChatServerMsg
  console.log(`${reply.author}: ${reply.text}`)
  await clientChatA(ch2)  // ch2: ChannelA<ClientChatLoopA>
}

// ─── Encoding A — what the compiler enforces ─────────────────────────────────
//
// ✓ Message SHAPE: each step has a precisely typed payload
// ✓ Message ORDER: impossible to send/recv out of protocol sequence
// ✓ Branch narrowing: choice.tag narrows pick()'s return type (discriminated union)
// ✗ Linearity: a spent channel reference can be called again — TS has no linear
//   types. The "spent channel" footgun exists but is mitigated by the ch→ch2→ch3
//   naming convention (old refs are still accessible but look obviously wrong).
// ✗ choose() trust: nothing prevents calling pick('leave') when tag === 'chat'.
//   The caller must respect the tag. This is a semantic contract, not a type one.
// ~ Handler verbosity: every operation returns a new channel ref; loops require
//   a named recursive function. Each `await` naturally produces a named result.
// ~ Recursive type aliases (ChatLoopA, ClientChatLoopA) work in TS 3.7+ via
//   lazy evaluation; may hit "excessively deep instantiation" at complex call sites.

// =============================================================================
// ENCODING B — Discriminated union dispatch (current WsChannel pattern)
// =============================================================================
//
// Server declares a typed flat union of all possible incoming messages.
// Handler is a for-await + switch. No order constraints.
// This is exactly what ws-context.ts's WsChannel<S> does today.

type ClientMsgB = JoinMsg | ChatClientMsg | LeaveMsg
type ServerMsgB = WelcomeMsg | FullMsg | ChatServerMsg | ByeMsg

interface WsChannelB {
  readonly messages: AsyncIterable<ClientMsgB>
  send(v: ServerMsgB): void
  close(): void
}

async function handleLobbyB(ch: WsChannelB): Promise<void> {
  let username = ''
  let joined = false

  for await (const msg of ch.messages) {
    switch (msg.type) {
      case 'join':
        if (checkCapacity()) {
          ch.send({ type: 'full', reason: 'room at capacity' })
          ch.close(); return
        }
        username = msg.username
        joined = true
        ch.send({ type: 'welcome', roomId: 'r1' })
        break
      case 'chat':
        if (!joined) break  // runtime guard — compiler cannot enforce join-before-chat
        ch.send({ type: 'chat', author: username, text: msg.text })
        break
      case 'leave':
        ch.send({ type: 'bye' })
        ch.close(); return
    }
  }
}

// ─── Client call-site ─────────────────────────────────────────────────────────

interface WsChannelBClient {
  readonly messages: AsyncIterable<ServerMsgB>
  send(v: ClientMsgB): void
  close(): void
}

async function lobbyClientB(ch: WsChannelBClient): Promise<void> {
  ch.send({ type: 'join', username: 'alice' })
  for await (const msg of ch.messages) {
    if (msg.type === 'welcome') { console.log('joined:', msg.roomId); continue }
    if (msg.type === 'full') { console.log('full:', msg.reason); ch.close(); return }
    if (msg.type === 'chat') { console.log(`${msg.author}: ${msg.text}`); continue }
    if (msg.type === 'bye') { ch.close(); return }
  }
}

// ─── Encoding B — what the compiler enforces ─────────────────────────────────
//
// ✓ Message SHAPE: switch/if-chain exhausts the union; each branch is typed
// ✗ Message ORDER: join-before-chat is a runtime guard, invisible to the type system
// ✗ Multi-phase constraint: auth-before-chat, welcome-before-chat are not expressible
// ✓ Readable: familiar switch / for-await; developers recognize this immediately
// ✓ No "spent channel" issue: single stable channel object
// ~ This is the current baseline; ORDER is the differentiator we are trying to add.

// =============================================================================
// ENCODING C — Phase-gated channels
// =============================================================================
//
// Two concrete phase interfaces, one per protocol phase. Phase advancement is
// a factory method: ChatPhaseC is ONLY obtainable by calling sendWelcome().
// The type system enforces the handshake-before-chat constraint structurally.

interface HandshakePhaseC {
  recvJoin(): Promise<JoinMsg>
  sendWelcome(roomId: string): ChatPhaseC  // factory: returns the next phase
  sendFull(reason: string): void           // terminal: no next phase
}

interface ChatPhaseC {
  readonly messages: AsyncIterable<ChatClientMsg | LeaveMsg>
  sendChat(author: string, text: string): void
  sendBye(): void
  close(): void
}

// ─── Server handler ───────────────────────────────────────────────────────────

declare function makeHandshakePhaseC(adapter: unknown): HandshakePhaseC

async function handleLobbyC(phase: HandshakePhaseC): Promise<void> {
  const join = await phase.recvJoin()
  //    ^JoinMsg — only recvJoin is visible; no chat methods on HandshakePhaseC

  if (checkCapacity()) {
    phase.sendFull('room at capacity')  // sendWelcome not called; ChatPhaseC never created
    return
  }

  const chat = phase.sendWelcome('r1')
  //    ^ChatPhaseC — obtainable ONLY via sendWelcome() (type-enforced gate)
  //    HandshakePhaseC methods are no longer needed and can be dropped

  for await (const msg of chat.messages) {
    //              ^ChatClientMsg | LeaveMsg — JoinMsg not in this union
    if (msg.type === 'leave') {
      chat.sendBye()
      chat.close()
      return
    }
    chat.sendChat(join.username, msg.text)
  }
}

// ─── Client call-site ─────────────────────────────────────────────────────────
//
// Server drives the branch decision (welcome vs full), so the client-side gate
// is on recvResponse(): the discriminated union makes ChatPhaseC available
// only in the 'welcome' arm.

interface ClientHandshakeC {
  sendJoin(username: string): void
  recvResponse(): Promise<
    | { type: 'welcome'; roomId: string; chat: ClientChatPhaseC }
    | { type: 'full'; reason: string }
  >
}

interface ClientChatPhaseC {
  sendChat(text: string): void
  sendLeave(): void
  readonly messages: AsyncIterable<ChatServerMsg | ByeMsg>
}

declare function makeClientHandshakeC(adapter: unknown): ClientHandshakeC

async function lobbyClientC(adapter: unknown): Promise<void> {
  const handshake = makeClientHandshakeC(adapter)
  handshake.sendJoin('alice')
  const response = await handshake.recvResponse()

  if (response.type === 'full') {
    console.log('full:', response.reason)
    return
  }
  // Narrowed: { type: 'welcome'; roomId: string; chat: ClientChatPhaseC }
  console.log('joined:', response.roomId)
  const chat = response.chat
  //    ^ClientChatPhaseC — only accessible in the 'welcome' arm

  chat.sendChat('hello!')
  for await (const msg of chat.messages) {
    if (msg.type === 'bye') break
    console.log(`${msg.author}: ${msg.text}`)
  }
}

// ─── Encoding C — what the compiler enforces ─────────────────────────────────
//
// ✓ Phase ORDER: ChatPhaseC is only obtainable via sendWelcome() / response.chat.
//   This is the handshake-before-chat constraint as a type-level structural gate.
// ✓ Per-phase message SHAPE: each phase method has precisely typed params/return
// ✓ Readable: handler is natural imperative flow; no ch0→ch1→ch2 chains; no
//   recursive functions required for loops.
// ✗ Within-phase ORDER: sendBye can be called multiple times inside ChatPhaseC;
//   no enforcement that the loop ends after sendBye.
// ✗ Exhaustiveness: nothing forces the handler to call either sendWelcome or
//   sendFull — it could return without calling either (connection leak).
// ~ Linearity: same weakness as Encoding A; phase objects can be reused in theory.
// ~ Per-message order within a phase could be added by nesting ChannelA.choose()
//   inside a phase method — a hybrid approach if stricter ordering is needed.

// =============================================================================
// ENCODING D — Branch/Select tree only (no Send/Recv chains)
// =============================================================================
//
// Eliminates Send/Recv. Every protocol step is a Branch (holder sends tag) or
// Select (holder awaits peer's tag). Data payloads are implicit in each leaf.
//
// Thesis: all protocols are just nested choices, and send/recv emerge naturally.
//
// Verdict: the thesis breaks on direction. Branch and Select carry payloads, but
// the payload type depends on WHO is speaking — the same tag ('chat') means
// different shapes for client-to-server vs server-to-client. Without direction
// annotations (i.e., Send/Recv), the payload type cannot be constrained correctly.

type TaggedSession = TBranch<any> | TSelect<any> | TEnd
interface TBranch<C extends Record<string, TaggedSession>> { _tag: 'TB'; _cases: C }
interface TSelect<C extends Record<string, TaggedSession>> { _tag: 'TS'; _cases: C }
interface TEnd { _tag: 'TE' }

type TChannelD<S extends TaggedSession> =
  S extends TBranch<infer C extends Record<string, TaggedSession>> ? {
    // Payload type is `any` because direction is unknown — this is the flaw.
    branch<K extends keyof C>(k: K, payload: any): TChannelD<C[K]>
  } :
  S extends TSelect<infer C extends Record<string, TaggedSession>> ? {
    choose(): Promise<{ [K in keyof C]: { tag: K; payload: any; pick(): TChannelD<C[K]> } }[keyof C]>
  } :
  S extends TEnd ? { close(): void } :
  never

// Lobby as a pure tree (server perspective):
//   Client selects 'join' → server branches 'welcome'|'full'
//   In welcome: client selects 'chat'|'leave' → server branches with reply

type ChatLoopD = TSelect<{
  chat:  TBranch<{ ack: ChatLoopD }>  // server sends chat ack, then loops
  leave: TBranch<{ bye: TEnd }>
}>

type LobbyTreeD = TSelect<{
  join: TBranch<{
    welcome: ChatLoopD
    full:    TEnd
  }>
}>

// ─── Server handler (partial — shows where the model breaks) ─────────────────

declare function makeChannelD(adapter: unknown): TChannelD<LobbyTreeD>

async function handleLobbyD_partial(ch: TChannelD<LobbyTreeD>): Promise<void> {
  const joinChoice = await ch.choose()
  if (joinChoice.tag !== 'join') return
  // joinChoice.payload is `any` — compiler cannot enforce JoinMsg shape here.
  // We must cast: const join = joinChoice.payload as JoinMsg
  const join = joinChoice.payload as JoinMsg

  if (checkCapacity()) {
    joinChoice.pick()
              .branch('full', { type: 'full', reason: 'at capacity' } satisfies FullMsg)
              //                               ^ `satisfies` works but `branch` takes `any`
              //                                 — the type is not constrained by the tree
              .close()
    return
  }

  const chatCh = joinChoice.pick().branch('welcome', { type: 'welcome', roomId: 'r1' } satisfies WelcomeMsg)
  //    ^TChannelD<ChatLoopD>
  await chatLoopD(chatCh, join.username)
}

async function chatLoopD(ch: TChannelD<ChatLoopD>, username: string): Promise<void> {
  const choice = await ch.choose()
  if (choice.tag === 'leave') {
    choice.pick().branch('bye', { type: 'bye' } satisfies ByeMsg).close()
    return
  }
  // choice.tag === 'chat'
  // choice.payload is `any` — ChatClientMsg shape is not enforced.
  const msg = choice.payload as ChatClientMsg
  // Server sends back the chat ack via branch('ack', ...) — but what payload shape?
  // The tree defines TBranch<{ ack: ChatLoopD }>, so payload for 'ack' is the
  // server's chat message. But `branch` takes `any` — no enforcement.
  const ch2 = choice.pick().branch('ack', { type: 'chat', author: username, text: msg.text } satisfies ChatServerMsg)
  //          payload must be `satisfies`-cast manually; compiler won't check it
  await chatLoopD(ch2, username)
}

// ─── Encoding D — analysis ────────────────────────────────────────────────────
//
// ✗ Payload types are `any` throughout. Send/Recv encode direction; removing them
//   means the compiler cannot distinguish client→server from server→client shapes.
//   The 'chat' tag means ChatClientMsg in one direction, ChatServerMsg in the other.
// ✗ Forced singleton selections: "client sends join" becomes "client selects from
//   {join: ...}" — a selection with one option. Unnatural and adds no type safety.
// ✗ Awkward loop encoding: the loop-back edge (ChatLoopD) works structurally but
//   the intermediate TBranch<{ ack: ChatLoopD }> has no natural meaning.
// ✓ Clean for PURE negotiation protocols where every step IS a genuine choice
//   (e.g., capability negotiation, version handshake) and payloads are trivial.
// Verdict: Encoding D is abandoned. It adds conceptual overhead without improving
//   on Encoding A for data-carrying protocols. Send/Recv are load-bearing.

// =============================================================================
// VERDICT
// =============================================================================
//
// CHOSEN: Encoding C — Phase-gated channels
//   With Encoding A's choose() API available as an escape hatch for intra-phase
//   ordering when a phase itself has a branch (e.g., auth accept/reject).
//
// RATIONALE:
//
// 1. Handler ergonomics win: server handlers read as natural imperative code.
//    No ch0→ch1→ch2 chains. The phase object is stable across all method calls
//    within that phase. Loops are plain for-await, not recursive functions.
//
// 2. The key type-level guarantee is preserved: the join-before-chat constraint
//    is a STRUCTURAL gate — ChatPhaseC is only obtainable via sendWelcome().
//    This is the differentiator over Encoding B (the current baseline), which
//    can only enforce phase ordering with a runtime `joined` flag.
//
// 3. Encoding A (full state-threading) provides stronger guarantees (per-message
//    order, not just per-phase) but at too high an ergonomic cost. The ch0→ch1
//    chaining pattern is unfamiliar to users, and every loop requires a named
//    recursive function. For typical HTTP-upgrade → WebSocket protocols, the
//    added precision is not worth the UX cost.
//
// 4. Encoding A's choose() API is the right primitive for INTRA-PHASE branching.
//    If a phase handler needs to branch on a server decision mid-phase, a phase
//    method can return ChoiceResultA<...> from Encoding A's design. This is a
//    composable opt-in rather than a default.
//
// WHAT PHASE-GATED DOES NOT ENFORCE:
//
// - Within-phase message ORDER (sendBye can be called multiple times)
// - Exhaustiveness (handler can return without calling sendWelcome or sendFull)
// - Linearity (phase objects are reusable after close)
// - Client-side phase symmetry is weaker: when the server drives the branch
//   decision, the client transitions on recv, not on send. The recvResponse()
//   pattern (with chat: ClientChatPhaseC embedded in the 'welcome' arm) is a
//   workable convention but is not mechanically derived from the server type.
//
// wsRoute / ws-context.ts IMPLEMENTATION PLAN (phase-gated):
//
// Step 1 — New type: PhaseSpec<Phases>  (framework/router/src/core/ws-phase.ts)
//   type PhaseSpec = {
//     [phaseName: string]: {
//       recv: SomeType      // message type the server receives in this phase
//       send: SomeType      // message type the server sends in this phase
//       next?: string       // name of next phase (absent = terminal)
//     }
//   }
//   The entry phase key is specified explicitly (e.g., `entry: 'handshake'`).
//
// Step 2 — Update wsRoute() to accept a `phases` option.
//   wsRoute(schema, path, { phases: spec, entry: 'handshake' })
//   produces RouteNode<..., WsContext<spec, 'handshake'>>.
//   The existing flat `in`/`out` option is kept for simple single-exchange routes.
//
// Step 3 — WsContext<Spec, Entry> provides the entry phase as `channel`:
//   buildWsPhaseChannel(adapter, spec, entry) constructs the phase runtime.
//   sendWelcome(roomId) advances the adapter's internal state to the 'chat' phase
//   and returns the ChatPhaseC runtime object.
//
// Step 4 — DualSpec<Spec> computes client-side types by swapping recv↔send.
//   WsClient.connect() returns DualSpec<Spec>[Entry] as the client entry phase.
//   The client's recvResponse() embeds the next phase object for the 'welcome' arm.
//
// Step 5 — Branch within a phase: when a phase's send type is a discriminated
//   union (WelcomeMsg | FullMsg), use named methods (sendWelcome / sendFull) where
//   the return type differs. This mirrors HandshakePhaseC above and keeps the
//   phase-transition intent explicit in the API surface.

export {}
