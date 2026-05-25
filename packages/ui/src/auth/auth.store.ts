import { Effect, Store, withLogging, type Reducer } from '@arbo/common';
import { liveAuthEnv, type AuthEnv, type User } from './auth.env.js';
import { PopupMessageSchema } from './auth.schemas.js';

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
  | { tag: 'popup-message'; data: unknown }
  | { tag: 'reauth-required' }
  | { tag: 'reauth-complete' }
  | { tag: 'reauth-failed' };

export const initialAuthState: AuthState = { tag: 'loading' };

export const authReducerInternal: Reducer<AuthState, AuthAction, AuthEnv> = ($, action, env) => {
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
    case 'popup-message': {
      console.log('popup-message received', action.data);
      const parsed = PopupMessageSchema.safeParse(action.data);
      if (!parsed.success) return null;
      switch (parsed.data.tag) {
        case 'reauth-complete':
          return Effect.send<AuthAction>({ tag: 'reauth-complete' });
        case 'reauth-failed':
          return Effect.send<AuthAction>({ tag: 'reauth-failed' });
      }
    }
    case 'reauth-required': {
      $.state = { tag: 'reauthing' };
      return env.openReauthPopup.map((data) => ({ tag: 'popup-message', data }));
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

export const authReducer = import.meta.env.DEV
  ? withLogging('auth', authReducerInternal)
  : authReducerInternal;

// Singleton — created once, lives for th e lifetime of the app
export const authStore = new Store(authReducer, liveAuthEnv, initialAuthState);
