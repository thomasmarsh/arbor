# Error Handling Approach

## Principles

- **Zero exceptions.** All errors are values, represented as discriminated unions.
- **Errors travel as actions.** The only channel for errors is the reducer - they arrive as action payloads, not thrown exceptions or effect error channels.
- **`Effect<A>` never grows an error channel.** Failures are modelled as valid `A` values (actions). This keeps the effect system simple and errors testable.
- **Pattern match everywhere.** Error types are discriminated unions so the compiler enforces exhaustive handling at every call site.

## Error Types

Defined per concern, close to where they are used. No single global error type.

### Network errors: `packages/common/src/errors/network.ts`

Shared between UI and BFF since both make fetch calls.

```typescript
export type NetworkError =
  | { tag: 'offline' }
  | { tag: 'timeout' }
  | { tag: 'http';  status: number; body: unknown }
  | { tag: 'parse'; issues: z.ZodIssue[] }

export function networkErrorFromUnknown(e: unknown): NetworkError { ... }
```

### Domain errors - per package

Live in the package that owns the domain, not in `common`.

```typescript
// packages/api/src/errors/domain.ts
export type UserError = { tag: 'not-found'; id: string } | { tag: 'forbidden' };

export type ProjectError = { tag: 'not-found'; id: string } | { tag: 'archived' };
```

## Wrapping at Boundaries

`Effect.tryCatch` is the only place unknown errors are caught and converted to typed errors. This happens at the outermost edge - fetch calls, DB queries - never inside business logic.

```typescript
Effect.tryCatch(
  () => env.fetchUsers(),
  (e): UsersAction => ({ tag: 'users-load-failed', error: networkErrorFromUnknown(e) }),
).map((users): UsersAction => ({ tag: 'users-loaded', users }));
```

## Actions Carry Errors

Every async operation has a corresponding failure action with a typed error payload.

```typescript
type UsersAction =
  | { tag: 'users-loaded'; users: User[] }
  | { tag: 'users-load-failed'; error: NetworkError };
```

## Reducer Decides

The reducer is the only place error handling decisions are made - retry, show error state, redirect, ignore. This makes error handling logic testable as pure functions.

```typescript
case 'users-load-failed':
  return [
    { ...state, users: { tag: 'error', error: action.error } },
    Effect.none(),
  ];
```

## UI Pattern Matches

Components pattern match on the error type in state to render the appropriate UI. No error boundaries needed for expected errors - only for truly unexpected exceptions (bugs).

```typescript
case 'error':
  switch (state.users.error.tag) {
    case 'offline':  return <OfflineBanner />;
    case 'timeout':  return <RetryPrompt />;
    case 'http':     return <ApiError status={state.users.error.status} />;
  }
```

## What We Don't Do

- No `throws` anywhere in business logic
- No `try/catch` except inside `Effect.tryCatch` at I/O boundaries
- No error channel on `Effect<A>`
- No global error handler / uncaught exception boundary for expected errors
- No `AppError` wrapper union - errors stay specific to their domain
