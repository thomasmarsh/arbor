import { describe, expect, expectTypeOf, it } from 'vitest';
import type { End, Recv, Send } from './session.js';
import { IxSession, done, type ChoiceResult, type Done } from './ix-session.js';

// Curried helper: ix<Bef, Aft>() returns a typed factory for IxSession<Bef,Aft,A>.
// Currying separates the un-inferable phantom params (Bef/Aft) from the
// inferable value param (A), sidestepping TypeScript's lack of partial inference.
function ix<Bef, Aft>() {
  return <A>(a: A): IxSession<Bef, Aft, A> => new IxSession((k) => k(a));
}

// ─── IxSession — state threading via .then() ─────────────────────────────────

describe('IxSession', () => {
  it('then() chains: A type comes from the continuation', () => {
    type S = Recv<string>;
    const s1 = ix<S, S>()('hello');
    const s2 = ix<S, S>()(99);
    const chained = s1.then(() => s2);
    expectTypeOf(chained.run()).toEqualTypeOf<Promise<number>>();
  });

  it('then() parameter constrains continuation Before to sender After', () => {
    type Bef = Recv<string, Send<number>>;
    type Mid = Send<number>;
    type ThenParam = Parameters<IxSession<Bef, Mid, string>['then']>[0];
    type GoodStep = (a: string) => IxSession<Mid, End, undefined>;
    expectTypeOf<GoodStep>().toExtend<ThenParam>();
  });

  it('then() threads Before→After: result A and After are correct', () => {
    type Bef = Recv<string, Send<number>>;
    type Mid = Send<number>;
    const s1 = ix<Bef, Mid>()('');
    const s2 = ix<Mid, End>()(undefined);
    const s3 = s1.then(() => s2);
    // A type of s3 is undefined (from s2)
    expectTypeOf(s3.run()).toEqualTypeOf<Promise<undefined>>();
    // After of s3 is End: then() must accept (a: undefined) => IxSession<End, ?, ?>
    type S3ThenParam = Parameters<typeof s3.then>[0];
    type EndContinuation = (a: undefined) => IxSession<End, End, undefined>;
    expectTypeOf<EndContinuation>().toExtend<S3ThenParam>();
  });

  it('of() resolves to the given value', async () => {
    const s = IxSession.of(42);
    expectTypeOf(s.run()).toEqualTypeOf<Promise<number>>();
    expect(await s.run()).toBe(42);
  });
});

// ─── Done token ───────────────────────────────────────────────────────────────

describe('Done', () => {
  it('done satisfies Done', () => {
    const _: Done = done;
    expectTypeOf(done).toEqualTypeOf<Done>();
  });

  it('plain symbol is not assignable to Done', () => {
    const s = Symbol('test');
    // @ts-expect-error — symbol is not assignable to Done (unique symbol)
    const _: Done = s;
  });
});

// ─── ChoiceResult<C> ─────────────────────────────────────────────────────────

describe('ChoiceResult', () => {
  interface C { a: Recv<string>; b: Send<number> }
  type CR = ChoiceResult<C>;

  it('is a discriminated union on tag', () => {
    type TagA = Extract<CR, { tag: 'a' }>;
    type TagB = Extract<CR, { tag: 'b' }>;
    expectTypeOf<TagA['tag']>().toEqualTypeOf<'a'>();
    expectTypeOf<TagB['tag']>().toEqualTypeOf<'b'>();
  });

  it('pick() return type is rooted at the chosen session branch', () => {
    type TagA = Extract<CR, { tag: 'a' }>;
    type PickReturn = ReturnType<TagA['pick']>;
    // pick() on the 'a' branch yields IxSession starting at Recv<string>
    expectTypeOf<PickReturn>().toExtend<IxSession<Recv<string>, Recv<string>, unknown>>();
  });

  it('C must satisfy Record<keyof C, Session>', () => {
    // @ts-expect-error — number is not a Session
    type _Bad = ChoiceResult<{ x: number }>;
  });
});
