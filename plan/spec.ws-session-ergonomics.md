# Spec: WebSocket Session Ergonomics — North Star

> Quick reference for plans 173–176 (and beyond).
> Shows the complete target API from protocol definition to server handler to client,
> using the **Lobby protocol** as a concrete example throughout.
>
> Derivation: `scratch/172-session-ergonomics.ts` (verdict: Encoding C + A's choose()),
>             `scratch/172b-cps-deep.ts` (Parts 1–5: CPS → Done token → IxSession).

---

## The Single Source of Truth

One session type declaration. Both parties derive from it — client type is `Dual<S>`.

```typescript
// framework/router/src/core/session.ts  (existing primitives)
// Send<T, Next>  — server sends T, advances to Next
// Recv<T, Next>  — server receives T, advances to Next
// Branch<Cases>  — server chooses a case, sends the tag
// Select<Cases>  — client chooses a case, sends the tag; server awaits
// End            — protocol complete

type ChatLoop = Select<{
  chat:  Recv<ChatClientMsg, Send<ChatServerMsg, ChatLoop>>
  leave: Recv<LeaveMsg,      Send<ByeMsg,        End>>
}>

type LobbySession = Recv<JoinMsg, Branch<{
  welcome: Send<WelcomeMsg, ChatLoop>
  full:    Send<FullMsg,    End>
}>>

// Client type — zero hand-authoring, derived automatically
// Dual<LobbySession>
//   = Send<JoinMsg, Select<{
//       welcome: Recv<WelcomeMsg, Dual<ChatLoop>>
//       full:    Recv<FullMsg,    End>
//     }>>
```

---

## Route Declaration

```typescript
import { wsSessionRoute } from '@arbor/router'

// `undefined as never as LobbySession` is the phantom value convention —
// the value is discarded; only the type parameter matters.
const lobbyRoute = wsSessionRoute(
  object({ tag: literal('ws/lobby') }),
  '/ws/lobby',
  undefined as never as LobbySession,
)

const router = defineRoutes([lobbyRoute])
```

---

## Server Handler

The handler receives `ops: IxSessionOps` — an adapter-bound factory of `IxSession` steps.
Each `ops.recv(schema)` / `ops.send(v, schema)` / `ops.branchTo(k)` / `ops.chooseFrom()`
returns an `IxSession` that is sequenced via `.then()` and executed via `.run()`.

```typescript
createWsSessionServer(router, {
  'ws/lobby': async ({ ops }) => {

    // Step 1 — receive join (typed by JoinSchema at the call site)
    const join = await ops.recv(JoinSchema).run()

    // Step 2 — server decides: welcome or full
    if (roomFull()) {
      await ops.branchTo('full')
               .then(() => ops.send({ type: 'full', reason: 'at capacity' }, FullSchema))
               .run()
      return
    }

    await ops.branchTo('welcome')
             .then(() => ops.send({ type: 'welcome', roomId: 'r1' }, WelcomeSchema))
             .then(() => chatLoop(ops, join.username))
             .run()
  },
})

async function chatLoop(ops: IxSessionOps, username: string): IxSession<ChatLoop, End, Done> {
  return ops.chooseFrom<ChatLoopCases>().then((choice) => {
    if (choice.tag === 'leave') {
      return choice.pick()
                   .then(() => ops.recv(LeaveSchema))
                   .then(() => ops.send({ type: 'bye' }, ByeSchema))
    }
    // choice.tag === 'chat'
    return choice.pick()
                 .then(() => ops.recv(ChatClientSchema))
                 .then((msg) => ops.send({ type: 'chat', author: username, text: msg.text }, ChatServerSchema))
                 .then(() => chatLoop(ops, username))
  })
}
```

**What the compiler enforces here:**
- `ops.recv(JoinSchema)` — schema must match `JoinMsg`; return typed `IxSession<..., ..., JoinMsg>`
- `.then()` on IxSession requires `_After` of left to match `_Before` of right
- `choice.tag === 'leave'` narrows `choice.pick()` return type (`ChoiceResult<C>` is a discriminated union)
- `chatLoop` returns `IxSession<ChatLoop, End, Done>` — wrong state labels are type errors

---

## Client

```typescript
const client = createWsSessionClient('ws://localhost', router)
const parsed = router.parse(new URL('http://localhost/ws/lobby'))
const ops = client.connectSession(parsed.value)

// Mirror of server: send instead of recv, await server's branch instead of branching
await ops.send({ type: 'join', username: 'alice' }, JoinSchema).run()

const serverChoice = await ops.chooseFrom<LobbyClientCases>().run()
// serverChoice: { tag: 'welcome'; pick(): IxSession<...> }
//             | { tag: 'full';    pick(): IxSession<...> }

if (serverChoice.tag === 'full') {
  const msg = await serverChoice.pick().then(() => ops.recv(FullSchema)).run()
  console.log('full:', msg.reason)
  return
}

const welcome = await serverChoice.pick().then(() => ops.recv(WelcomeSchema)).run()
console.log('joined room:', welcome.roomId)

// Chat loop: client chooses, server receives
await ops.branchTo('chat')
         .then(() => ops.send({ type: 'chat', text: 'hello' }, ChatClientSchema))
         .then(() => ops.recv(ChatServerSchema))
         .run()
```

---

## The IxSession Type (core)

```typescript
// src/core/ix-session.ts  (Plan 173)
class IxSession<_Before, _After, A> {
  then<NewAfter, B>(
    f: (a: A) => IxSession<_After, NewAfter, B>
  ): IxSession<_Before, NewAfter, B>

  run(): Promise<A>
}

// Unique symbol — unforgeable proof of protocol completion
declare const _done: unique symbol
type Done = typeof _done

// Discriminated union for Select — tag narrows pick()'s return type
type ChoiceResult<C extends Record<string, Session>> = {
  [K in keyof C]: { tag: K; pick(): IxSession<C[K], any, any> }
}[keyof C]
```

---

## The Ops Interface (runtime)

```typescript
// src/core/ix-session-ops.ts  (Plan 174)
interface IxSessionOps {
  recv<T>(schema: UserSchema<T>): IxSession<Recv<T, any>, any, T>
  send<T>(v: T, schema: UserSchema<T>): IxSession<Send<T, any>, any, void>
  branchTo<C extends Record<string, Session>, K extends keyof C & string>(
    k: K
  ): IxSession<Branch<C>, C[K], void>
  chooseFrom<C extends Record<string, Session>>(): IxSession<Select<C>, any, ChoiceResult<C>>
  close(): Promise<Done>
}

// Factory — create per-connection; binds ops to the WsAdapter
function buildIxSessionOps(adapter: WsAdapter): IxSessionOps
```

---

## What Each Layer Enforces

| Concern | Mechanism | Limitation |
|---|---|---|
| Step **ordering** | `IxSession<Before, After>` — `.then()` requires `After` to match next `Before` | Phantom only; `as any` escapes |
| Step **shape** | Schema param to `recv`/`send` — validated at runtime via `syncValidate` | Compile-time only when schema type matches generic |
| Must-**advance** | `Done` token — `close()` and terminal `send()` return `Promise<Done>`; handler must produce `Done` to return | Implicit `return` gives `void`; not fully sealed without explicit `run()` contract |
| **Branch** exhaustion | `ChoiceResult<C>` is a discriminated union; narrowing `tag` narrows `pick()` | Nothing prevents calling the wrong `pick(k)` if you ignore the tag |
| **Double-advance** | Runtime: `withProtocolTracking` HOC (deferred) | Not a compile-time check |
| **Linearity** | Not enforced — TypeScript has no affine types | `run()` can be called on a spent `IxSession` |

---

## Key Design Decisions (locked)

1. **Parallel path**: `wsSessionRoute` / `createWsSessionServer` / `createWsSessionClient`
   are additive alongside the existing `wsRoute` / `createWsServer` / `createWsClient`.
   Existing code is unchanged.

2. **`IxSessionOps` is untyped at method level**: `recv<T>(schema)` takes any schema,
   any `T`. The session type `S` lives on the route node; it constrains the handler via
   `WsSessionHandlerMap`, not via the ops object itself. This avoids complex recursive
   conditional types on the ops interface and keeps it implementable.

3. **`Dual<S>` is the client type**: the client uses the same `IxSessionOps` interface
   as the server. The type-level distinction (`S` vs `Dual<S>`) is tracked on the route
   node, not the ops object. A fully typed client ops interface (`IxSessionOps<Dual<S>>`)
   is a follow-on improvement.

4. **Wire protocol for Branch/Select**: tags are sent as a separate JSON envelope
   `{ tag: string }` before the payload message. `branchTo('welcome')` sends
   `{ tag: 'welcome' }`; the peer's `chooseFrom()` reads that envelope. The following
   `send(welcomeMsg, ...)` sends the payload. Two messages per branch/select step.
   Alternative (merged tag+payload) is deferred.

5. **`session` param is phantom**: `wsSessionRoute(schema, path, undefined as never as S)`
   — the value is discarded; only the type matters. Same pattern as `sessionRoute` in
   `session-route.ts`.
