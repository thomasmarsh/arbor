export type Sub<A> =
  | { tag: 'keydown'; handler: (e: KeyboardEvent) => A | null }
  | { tag: 'none' };

export const Sub = {
  keydown<A>(handler: (e: KeyboardEvent) => A | null): Sub<A> {
    return { tag: 'keydown', handler };
  },
  none<A>(): Sub<A> {
    return { tag: 'none' };
  },
};
