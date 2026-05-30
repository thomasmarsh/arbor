type ResultType<T, Err> = { ok: true; value: T } | { ok: false; error: Err };

export class Result<out T, out E = Error> {
  private result: ResultType<T, E>;

  private constructor(result: ResultType<T, E>) {
    this.result = result;
  }

  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>({ ok: true, value });
  }

  static err<T = never, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>({ ok: false, error });
  }

  static fromThrowable<T, E = Error>(fn: () => T, fallback?: (err: unknown) => E): Result<T, E> {
    try {
      return Result.ok(fn());
    } catch (e) {
      return Result.err(fallback ? fallback(e) : (e as E));
    }
  }

  static async fromPromise<T, E = Error>(
    promise: Promise<T>,
    fallback?: (err: unknown) => E,
  ): Promise<Result<T, E>> {
    try {
      const data = await promise;
      return Result.ok(data);
    } catch (e) {
      return Result.err(fallback ? fallback(e) : (e as E));
    }
  }

  static async fromAsync<T, E = Error>(
    fn: () => Promise<T>,
    fallback?: (err: unknown) => E,
  ): Promise<Result<T, E>> {
    try {
      const data = await fn();
      return Result.ok(data);
    } catch (e) {
      return Result.err(fallback ? fallback(e) : (e as E));
    }
  }

  static settled<T, E>(results: Result<T, E>[]): { successes: T[]; failures: E[] } {
    const successes: T[] = [];
    const failures: E[] = [];
    for (const res of results) {
      if (res.result.ok) {
        successes.push(res.result.value);
      } else {
        failures.push(res.result.error);
      }
    }
    return { successes, failures };
  }

  static combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
    const values: T[] = [];
    for (const res of results) {
      if (res.isOk()) {
        values.push(res.value);
      } else {
        return res as unknown as Result<T[], E>;
      }
    }
    return Result.ok(values);
  }

  public isOk(): this is Result<T, E> & { readonly value: T } {
    return this.result.ok;
  }

  public isErr(): this is Result<T, E> & { readonly error: E } {
    return !this.result.ok;
  }

  public get value(): T | undefined {
    return this.result.ok ? this.result.value : undefined;
  }

  public get error(): E | undefined {
    return !this.result.ok ? this.result.error : undefined;
  }

  public getOrThrow(): T {
    if (this.result.ok) return this.result.value;

    let errorMsg: string;
    if (this.result.error instanceof Error) {
      errorMsg = this.result.error.message;
    } else if (typeof this.result.error === 'object' && this.result.error !== null) {
      try {
        errorMsg = JSON.stringify(this.result.error);
      } catch {
        errorMsg = '[Unserializable Circular Object]';
      }
    } else {
      errorMsg = String(this.result.error);
    }

    throw new Error(`Force unwrap expected ok, but was err: ${errorMsg}`);
  }

  public getErrorOrThrow(): E {
    if (!this.result.ok) return this.result.error;
    throw new Error('Force unwrap expected err, but was ok');
  }

  public getOrElse(fallback: T): T {
    return this.result.ok ? this.result.value : fallback;
  }

  public fold<A>(onOk: (value: T) => A, onErr: (error: E) => A): A {
    return this.result.ok ? onOk(this.result.value) : onErr(this.result.error);
  }

  public map<U>(f: (value: T) => U): Result<U, E> {
    return this.result.ok ? Result.ok(f(this.result.value)) : (this as unknown as Result<U, E>);
  }

  public mapError<F>(f: (value: E) => F): Result<T, F> {
    return this.result.ok ? (this as unknown as Result<T, F>) : Result.err(f(this.result.error));
  }

  public flatMap<U>(f: (value: T) => Result<U, E>): Result<U, E> {
    return this.result.ok ? f(this.result.value) : (this as unknown as Result<U, E>);
  }

  public flatMapError<F>(f: (value: E) => Result<T, F>): Result<T, F> {
    return this.result.ok ? (this as unknown as Result<T, F>) : f(this.result.error);
  }

  public async mapAsync<U, F = E>(
    f: (value: T) => Promise<U>,
    fallback?: (err: unknown) => F,
  ): Promise<Result<U, E | F>> {
    if (!this.result.ok) return this as unknown as Result<U, E | F>;
    try {
      const mapped = await f(this.result.value);
      return Result.ok(mapped);
    } catch (e) {
      return Result.err(fallback ? fallback(e) : (e as F));
    }
  }

  public async flatMapAsync<U>(f: (value: T) => Promise<Result<U, E>>): Promise<Result<U, E>> {
    if (!this.result.ok) return this as unknown as Result<U, E>;
    return f(this.result.value);
  }
}
