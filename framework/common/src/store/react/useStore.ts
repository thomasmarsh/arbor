import { useRef } from 'react';
import { useSnapshot, type Snapshot } from 'valtio';
import type { Send } from '../effect.js';
import { Store, type Reducer } from '../store.js';

export function useStore<S, A, R>(
  reducer: Reducer<S, A, R>,
  environment: R,
  initialState: S,
): [{ state: Snapshot<S> }, Send<A>] {
  const storeRef: React.RefObject<null | Store<S, A, R>> = useRef(null);
  storeRef.current ??= new Store(reducer, environment, initialState);
  storeRef.current.setDependencies(reducer, environment);
  const snapshot = useSnapshot(storeRef.current.getProxyState());
  return [snapshot, storeRef.current.send];
}
