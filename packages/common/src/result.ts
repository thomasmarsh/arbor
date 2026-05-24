type ResultType<T, Err> = { ok: true; value: T } | { ok: false; error: Err };

export class Result<out T, out E = Error> {
  private result: ResultType<T, E>;

  private constructor(result: ResultType<T, E>) {
    this.result = result;
  }

  static success<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>({ ok: true, value });
  }

  static failure<T = never, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>({ ok: false, error });
  }

  public isSuccess(): this is Result<T, never> {
    return this.result.ok;
  }

  public isFailure(): this is Result<never, E> {
    return !this.result.ok;
  }

  public getOrElse(fallback: T): T {
    return this.result.ok ? this.result.value : fallback;
  }

  public fold<A>(onSuccesss: (value: T) => A, onFailure: (error: E) => A): A {
    return this.result.ok ? onSuccesss(this.result.value) : onFailure(this.result.error);
  }

  public map<U>(f: (value: T) => U): Result<U, E> {
    return this.result.ok
      ? Result.success(f(this.result.value))
      : Result.failure(this.result.error);
  }

  public mapError<F>(f: (value: E) => F): Result<T, F> {
    return this.result.ok
      ? Result.success(this.result.value)
      : Result.failure(f(this.result.error));
  }

  public flatMap<U>(f: (value: T) => Result<U, E>): Result<U, E> {
    return this.result.ok ? f(this.result.value) : Result.failure(this.result.error);
  }

  public flatMapError<F>(f: (value: E) => Result<T, F>): Result<T, F> {
    return this.result.ok ? Result.success(this.result.value) : f(this.result.error);
  }
}
