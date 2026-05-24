export type Send<A> = (a: A) => void;

export type UnsafeRun<A> = (send: Send<A>) => void;

export class Effect<A> {
  private run: UnsafeRun<A>;

  constructor(unsafeRun: UnsafeRun<A>) {
    this.run = unsafeRun;
  }

  public unsafeRun(send: Send<A>) {
    this.run(send);
  }

  public static send<A>(a: A): Effect<A> {
    return new Effect((send) => {
      send(a);
    });
  }

  public map<B>(f: (a: A) => B): Effect<B> {
    return new Effect((send) => {
      this.run((a) => {
        send(f(a));
      });
    });
  }

  public tryPromise<A>(promise: Promise<A>, onReject: (err: unknown) => A): Effect<A> {
    return new Effect((send) => {
      promise.then(send).catch((x: unknown) => {
        send(onReject(x));
      });
    });
  }
}
