import { Effect, Store, type Reducer } from '@arbo/common';
import { mockAuthEnv, type AuthEnv, type User } from './auth.env.js';

export type AuthState =
  | { tag: 'loading' }
  | { tag: 'authenticated'; user: User }
  | { tag: 'unauthenticated' }
  | { tag: 'reauthing' };

export type AuthAction =
  | { tag: 'load' }
  | { tag: 'loaded'; user: User }
  | { tag: 'load-failed' }
  | { tag: 'logout' }
  | { tag: 'reauth-required' }
  | { tag: 'reauth-complete' }
  | { tag: 'reauth-failed' };

export const initialAuthState: AuthState = { tag: 'loading' };

export const authReducer: Reducer<AuthState, AuthAction, AuthEnv> = ($, action, env) => {
  switch (action.tag) {
    case 'load': {
      return env.getUser.map((result) =>
        result.fold<AuthAction>(
          (user) => ({ tag: 'loaded', user }),
          (_err) => ({ tag: 'load-failed' }),
        ),
      );
    }
    case 'loaded': {
      $.state = { tag: 'authenticated', user: action.user };
      return null;
    }
    case 'load-failed': {
      $.state = { tag: 'unauthenticated' };
      return null;
    }
    case 'logout': {
      $.state = { tag: 'unauthenticated' };
      return env.logout;
    }
    case 'reauth-required': {
      $.state = { tag: 'reauthing' };
      return null;
    }
    case 'reauth-complete': {
      $.state = { tag: 'loading' };
      return Effect.merge<AuthAction>(
        env.resolveReauth.widen<AuthAction>(),
        Effect.send({ tag: 'load' }),
      );
    }
    case 'reauth-failed': {
      $.state = { tag: 'unauthenticated' };
      return null;
    }
  }
};

// Singleton — created once, lives for the lifetime of the app
export const authStore = new Store(authReducer, mockAuthEnv, initialAuthState);
