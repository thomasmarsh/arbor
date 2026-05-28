export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const Result = {
  success: <T>(value: T): Result<T, never> => ({ ok: true, value }),
  failure: <E>(error: E): Result<never, E> => ({ ok: false, error }),
  isSuccess: <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok,
  isFailure: <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok,
};
