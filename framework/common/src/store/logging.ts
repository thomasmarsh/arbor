import { snapshot } from 'valtio';
import type { Reducer } from './store.js';

export function withLogging<S, A extends { tag: string }, R>(
  name: string,
  reducer: Reducer<S, A, R>,
): Reducer<S, A, R> {
  return ($, action, env) => {
    const effect = reducer($, action, env);
    console.groupCollapsed(
      `%c${name}%c ${action.tag}%c ${effect == null ? '∅' : '⚡'}`,
      'color: #888; font-weight: normal',
      'color: #fff; font-weight: bold',
      'color: #f90',
    );
    console.log('%caction ', 'color: #88f', action);
    console.log('%cstate  ', 'color: #8f8', snapshot($).state);
    if (effect != null) {
      console.log('%ceffect ', 'color: #f90', effect);
    }
    console.groupEnd();
    return effect;
  };
}
