/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useEffect, useRef, useState } from 'react';
import { snapshot, subscribe, type Snapshot } from 'valtio';
import type { Send } from '../effect.js';
import { Store, type Reducer } from '../store.js';

export function useStore<S, A, R>(
  reducer: Reducer<S, A, R>,
  environment: R,
  initialState: S,
): [{ state: Snapshot<S> }, Send<A>] {
  const storeRef = useRef<Store<S, A, R> | null>(null);
  storeRef.current ??= new Store(reducer, environment, initialState);
  storeRef.current.setDependencies(reducer, environment);

  const [state, setState] = useState(() => snapshot(storeRef.current!.getProxyState()));

  useEffect(() => {
    return subscribe(storeRef.current!.getProxyState(), () => {
      setState(snapshot(storeRef.current!.getProxyState()));
    });
  }, []);

  return [state, storeRef.current.send] as const;
  // const storeRef: React.RefObject<null | Store<S, A, R>> = useRef(null);
  // storeRef.current ??= new Store(reducer, environment, initialState);
  // storeRef.current.setDependencies(reducer, environment);
  // const snapshot = useSnapshot(storeRef.current.getProxyState());
  // return [snapshot, storeRef.current.send];
}
