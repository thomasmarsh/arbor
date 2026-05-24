// packages/common/src/store/react/createEnvContext.ts
import { createContext, useContext } from 'react';

export function createEnvContext<Env>() {
  const Context = createContext<Env | null>(null);

  function useEnv<T>(select: (env: Env) => T): T {
    const env = useContext(Context);
    if (env == null) throw new Error('Environment context not provided');
    return select(env);
  }

  return { Context, useEnv };
}
