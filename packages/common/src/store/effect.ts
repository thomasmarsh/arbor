import { Effect as Eff, Runtime, Schedule, pipe } from 'effect';
import { Result } from '../result.js';

export type Send<A> = (a: A) => void;

const runtime = Runtime.defaultRuntime;

type Runner<A> = (send: Send<A>) => Eff.Effect<void>;

export class Effect<A> {
  private readonly runner: Runner<A>;

  private constructor(runner: Runner<A>) {
    this.runner = runner;
  }

  private suspend(send: Send<A>): Eff.Effect<void> {
    return Eff.suspend(() => this.runner(send));
  }

  public static of<A>(runner: (send: Send<A>) => void): Effect<A> {
    return new Effect((send) =>
      Eff.sync(() => {
        runner(send);
      }),
    );
  }

  public unsafeRun(send: Send<A>): void {
    const eff = this.runner(send);
    Runtime.runFork(runtime, eff);
  }

  /** Runs synchronously. Throws if the effect requires async (use in tests only). */
  public unsafeRunSync(send: Send<A>): void {
    const eff = this.runner(send);
    Runtime.runSync(runtime, eff);
  }

  public static none<A>(): Effect<A> {
    return new Effect(() => Eff.void);
  }

  public static send<A>(a: A): Effect<A> {
    return new Effect((send) =>
      Eff.sync(() => {
        send(a);
      }),
    );
  }

  public map<B>(f: (a: A) => B): Effect<B> {
    return new Effect<B>((send) =>
      this.suspend((a) => {
        send(f(a));
      }),
    );
  }

  public delay(ms: number): Effect<A> {
    return new Effect((send) => this.suspend(send).pipe(Eff.delay(ms)));
  }

  public retry(times: number): Effect<A> {
    return new Effect((send) => this.suspend(send).pipe(Eff.retry(Schedule.recurs(times))));
  }

  public timeout(ms: number, onTimeout: A): Effect<A> {
    return new Effect((send) =>
      this.suspend(send).pipe(
        Eff.timeout(ms),
        Eff.catchTag('TimeoutException', () =>
          Eff.sync(() => {
            send(onTimeout);
          }),
        ),
      ),
    );
  }

  public static merge<A>(...effects: Effect<A>[]): Effect<A> {
    return new Effect((send) =>
      Eff.all(
        effects.map((e) => e.suspend(send)),
        { concurrency: 'unbounded' },
      ).pipe(Eff.asVoid),
    );
  }

  public static tryPromise<A, S, F>(
    promise: () => Promise<A>,
    onSuccess: (a: A) => S,
    onReject: (err: unknown) => F,
  ): Effect<S | F> {
    return new Effect((send) =>
      pipe(
        Eff.tryPromise({ try: promise, catch: (e) => e }),
        Eff.match({
          onSuccess: (a) => {
            send(onSuccess(a));
          },
          onFailure: (e) => {
            send(onReject(e));
          },
        }),
      ),
    );
  }

  public static sleep(ms: number): Effect<void> {
    return new Effect((send) =>
      Eff.sleep(ms).pipe(
        Eff.andThen(
          Eff.sync(() => {
            send(undefined);
          }),
        ),
      ),
    );
  }

  public static tryCatch<T, E>(
    promise: () => Promise<T>,
    onError: (err: unknown) => E,
  ): Effect<Result<T, E>> {
    return Effect.fromEff(
      Eff.tryPromise({
        try: promise,
        catch: (e) => onError(e),
      }).pipe(
        Eff.map((x) => Result.ok<T>(x)),
        Eff.catchAll((e) => Eff.succeed(Result.err<T, E>(e))),
      ),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public widen<_>(): this {
    return this;
  }

  public static fromEff<A>(eff: Eff.Effect<A>): Effect<A> {
    return new Effect((send) =>
      Eff.flatMap(eff, (a) =>
        Eff.sync(() => {
          send(a);
        }),
      ),
    );
  }
}
