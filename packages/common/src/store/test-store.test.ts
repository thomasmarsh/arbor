import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Effect } from './effect.js';
import { type Reducer } from './store.js';
import { TestStore, createTestStore } from './test-store.js';

// ---------------------------------------------------------------------------
// Fixture A: pure (no effects) — used for mutation-only tests and PBT
// ---------------------------------------------------------------------------

interface CountA { n: number }
type ActionA = 'inc' | 'dec' | 'reset';

const reducerA: Reducer<CountA, ActionA, null> = ($, action) => {
  switch (action) {
    case 'inc':
      $.state.n += 1;
      break;
    case 'dec':
      $.state.n -= 1;
      break;
    case 'reset':
      $.state.n = 0;
      break;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Fixture B: effect-dispatching — used for send→receive tests
// ---------------------------------------------------------------------------

interface CountB {
  count: number;
  log: string[];
}

type ActionB =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'reset' }
  | { type: 'logged'; msg: string };

interface EnvB {
  timestamp: () => string;
}

const envB: EnvB = { timestamp: () => 'T' };

const reducerB: Reducer<CountB, ActionB, EnvB> = ($, action, env) => {
  switch (action.type) {
    case 'increment':
      $.state.count += 1;
      return Effect.send<ActionB>({ type: 'logged', msg: `+1@${env.timestamp()}` });
    case 'decrement':
      $.state.count -= 1;
      return Effect.send<ActionB>({ type: 'logged', msg: `-1@${env.timestamp()}` });
    case 'reset':
      $.state.count = 0;
      $.state.log = [];
      return null;
    case 'logged':
      $.state.log.push(action.msg);
      return null;
  }
};

const initialB = (): CountB => ({ count: 0, log: [] });

// ---------------------------------------------------------------------------
// Pure state mutation (no effects)
// ---------------------------------------------------------------------------

describe('TestStore — pure mutations', () => {
  it('passes when closure correctly describes the mutation', () => {
    const store = new TestStore(reducerA, null, { n: 0 });
    store.send('inc', (s) => {
      s.n = 1;
    });
    store.assertDrained();
  });

  it('throws when state changes but no closure is given', () => {
    const store = new TestStore(reducerA, null, { n: 0 });
    expect(() => store.send('inc')).toThrow();
    // store abandoned — it was never registered with afterEach
  });

  it('throws when closure describes the wrong value', () => {
    const store = new TestStore(reducerA, null, { n: 0 });
    expect(() =>
      store.send('inc', (s) => {
        s.n = 99;
      }),
    ).toThrow();
  });

  it('omitting closure is fine when action genuinely produces no state change', () => {
    const store = new TestStore(reducerA, null, { n: 0 });
    store.send('reset'); // n=0 → n=0; no closure means "expect no change"
    store.assertDrained();
  });

  it('chains multiple sends with per-step assertions', () => {
    const store = new TestStore(reducerA, null, { n: 0 });
    store
      .send('inc', (s) => {
        s.n = 1;
      })
      .send('inc', (s) => {
        s.n = 2;
      })
      .send('dec', (s) => {
        s.n = 1;
      })
      .send('reset', (s) => {
        s.n = 0;
      });
    store.assertDrained();
  });
});

// ---------------------------------------------------------------------------
// Effect dispatch (send → receive)
// ---------------------------------------------------------------------------

describe('TestStore — send/receive', () => {
  it('receive captures the follow-up action and asserts its state change', () => {
    const store = new TestStore(reducerB, envB, initialB());
    store
      .send({ type: 'increment' }, (s) => {
        s.count = 1;
      })
      .receive({ type: 'logged', msg: '+1@T' }, (s) => {
        s.log = ['+1@T'];
      });
    store.assertDrained();
  });

  it('full inc→dec chain with all steps asserted', () => {
    const store = new TestStore(reducerB, envB, initialB());
    store
      .send({ type: 'increment' }, (s) => {
        s.count = 1;
      })
      .receive({ type: 'logged', msg: '+1@T' }, (s) => {
        s.log = ['+1@T'];
      })
      .send({ type: 'decrement' }, (s) => {
        s.count = 0;
      })
      .receive({ type: 'logged', msg: '-1@T' }, (s) => {
        s.log = ['+1@T', '-1@T'];
      });
    store.assertDrained();
  });

  it('reset has no effect and no follow-up action', () => {
    const store = new TestStore(reducerB, envB, { count: 5, log: ['a'] });
    store.send({ type: 'reset' }, (s) => {
      s.count = 0;
      s.log = [];
    });
    store.assertDrained();
  });

  it('throws when receive is called with the wrong action identity', () => {
    const store = new TestStore(reducerB, envB, initialB());
    store.send({ type: 'increment' }, (s) => {
      s.count = 1;
    });
    expect(() => store.receive({ type: 'logged', msg: 'wrong' })).toThrow();
  });

  it('throws when receive is called but no effects were dispatched', () => {
    const store = new TestStore(reducerB, envB, initialB());
    store.send({ type: 'reset' });
    expect(() => store.receive({ type: 'logged', msg: 'anything' })).toThrow(
      /no effects have been dispatched/,
    );
    store.assertDrained();
  });

  it('receive throws when the expected state change is wrong', () => {
    const store = new TestStore(reducerB, envB, initialB());
    store.send({ type: 'increment' }, (s) => {
      s.count = 1;
    });
    expect(() =>
      store.receive({ type: 'logged', msg: '+1@T' }, (s) => {
        s.log = ['wrong-value'];
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Drain enforcement
// ---------------------------------------------------------------------------

describe('TestStore — drain enforcement', () => {
  it('assertDrained throws when pending actions remain', () => {
    const store = new TestStore(reducerB, envB, initialB());
    store.send({ type: 'increment' }, (s) => {
      s.count = 1;
    });
    expect(() => { store.assertDrained(); }).toThrow(/unhandled action/);
    // drain so we can cleanly end this test
    store.receive({ type: 'logged', msg: '+1@T' }, (s) => {
      s.log = ['+1@T'];
    });
    store.assertDrained();
  });

  it('createTestStore registers afterEach automatically', () => {
    // The afterEach for this store will run after the test; both sends return null
    // so nothing will be pending and afterEach will pass silently.
    const store = createTestStore(reducerA, null, { n: 0 });
    store
      .send('inc', (s) => {
        s.n = 1;
      })
      .send('dec', (s) => {
        s.n = 0;
      });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests (fast-check)
// ---------------------------------------------------------------------------

describe('TestStore — PBT', () => {
  it('count = initial + #inc − #dec for any action sequence', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.array(fc.constantFrom<ActionA>('inc', 'dec', 'reset'), { maxLength: 40 }),
        (start, actions) => {
          const store = new TestStore(reducerA, null, { n: start });
          let cur = start;
          for (const action of actions) {
            const next =
              action === 'inc' ? cur + 1 : action === 'dec' ? cur - 1 : 0;
            if (next !== cur) {
              store.send(action, (s) => {
                s.n = next;
              });
            } else {
              store.send(action);
            }
            cur = next;
          }
          store.assertDrained();
        },
      ),
    );
  });

  it('N increments followed by N decrements returns to start', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 0, max: 25 }),
        (start, n) => {
          const store = new TestStore(reducerA, null, { n: start });
          for (let i = 0; i < n; i++) {
            const next = start + i + 1;
            store.send('inc', (s) => {
              s.n = next;
            });
          }
          for (let i = 0; i < n; i++) {
            const next = start + n - i - 1;
            store.send('dec', (s) => {
              s.n = next;
            });
          }
          store.assertDrained();
        },
      ),
    );
  });

  it('reset always yields n=0 regardless of prior state', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 500 }),
        fc.array(fc.constantFrom<ActionA>('inc', 'dec'), { maxLength: 20 }),
        (start, prefix) => {
          const store = new TestStore(reducerA, null, { n: start });
          let cur = start;
          for (const a of prefix) {
            const next = a === 'inc' ? cur + 1 : cur - 1;
            store.send(a, (s) => {
              s.n = next;
            });
            cur = next;
          }
          store.send('reset', (s) => {
            s.n = 0;
          });
          store.assertDrained();
        },
      ),
    );
  });

  it('send never throws for well-described mutations (never-throw)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ActionA>('inc', 'dec', 'reset'),
        (action) => {
          const store = new TestStore(reducerA, null, { n: 0 });
          const delta = action === 'inc' ? 1 : action === 'dec' ? -1 : 0;
          const next = delta === 0 ? 0 : delta;
          if (next !== 0) {
            store.send(action, (s) => {
              s.n = next;
            });
          } else {
            store.send(action);
          }
          store.assertDrained();
        },
      ),
    );
  });
});
