import { useEffect, useRef } from 'react';
import { useSnapshot, type Snapshot } from 'valtio';
import { subscribe } from 'valtio/vanilla';
import type { Send } from '../effect.js';
import { Store, type Reducer } from '../store.js';
import type { Sub } from '../sub.js';

// Selector-based post-commit view reaction; one stable subscribe manages all watchers.
export type Watch<S> = <T>(selector: (state: S) => T, fn: () => void) => void;

export function useStore<S, A, R>(
  reducer: Reducer<S, A, R>,
  // Factory form `() => R` is called once on mount; result is stable across renders.
  // Pass a factory when the env must close over component-local refs.
  environment: R | (() => R),
  initialState: S,
  // Fired once after first render; lives in the reducer, not the component.
  onMount?: A,
  // Declarative subscriptions; runtime manages listener lifecycle each render.
  subscriptions?: (state: Snapshot<S>) => Sub<A>[],
): [{ state: Snapshot<S> }, Send<A>, Watch<S>] {
  const envRef = useRef<R | null>(null);
  envRef.current ??= typeof environment === 'function'
    ? (environment as () => R)()
    : environment;
  // For non-factory envs that change (e.g. env from props), keep store in sync.
  const resolvedEnv: R = typeof environment === 'function'
    ? envRef.current
    : environment;

  const storeRef = useRef<Store<S, A, R> | null>(null);
  const store = (storeRef.current ??= new Store(reducer, resolvedEnv, initialState));
  store.setDependencies(reducer, resolvedEnv);

  const snapshot = useSnapshot(store.getProxyState());

  // Fire onMount action exactly once after first render.
  const onMountRef = useRef(onMount);
  useEffect(() => {
    if (onMountRef.current !== undefined) store.send(onMountRef.current);
  }, []); // mount-only

  // Watch callbacks re-register each render (fresh closures).
  // One stable subscribe fires them only when their selector output changes.
  const watchListRef = useRef<[(s: S) => unknown, () => void][]>([]);
  watchListRef.current = [];
  const watch: Watch<S> = (selector, fn) => {
    watchListRef.current.push([selector, fn]);
  };
  useEffect(() => {
    const proxy = store.getProxyState();
    const prevValues = new Map<number, unknown>();
    return subscribe(proxy, () => {
      watchListRef.current.forEach(([selector, fn], i) => {
        const next = selector(proxy.state);
        if (!Object.is(prevValues.get(i), next)) {
          prevValues.set(i, next);
          fn();
        }
      });
    });
  }, []); // mount-only: subscribe is stable

  // Diff subscription list each render; add/remove event listeners as needed.
  useEffect(() => {
    if (!subscriptions) return;
    const proxy = store.getProxyState();
    const subs = subscriptions(proxy.state as Snapshot<S>);
    const cleanups = subs.map((sub): (() => void) => {
      if (sub.tag === 'keydown') {
        const handler = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement) return;
          const action = sub.handler(e);
          if (action !== null) store.send(action);
        };
        window.addEventListener('keydown', handler);
        return () => { window.removeEventListener('keydown', handler); };
      }
      return () => { return; };
    });
    return () => { cleanups.forEach((c) => { c(); }); };
  });

  return [snapshot, store.send, watch];
}
