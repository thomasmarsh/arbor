import { Effect, Result } from '@arbor/common';
import type { HttpError } from '@arbor/common/http';
import { httpClient } from '../api/auth.interceptor.js';
import { UserSchema } from './auth.schemas.js';

export interface User {
  sub: string;
  name: string;
  email: string;
}

export interface AuthEnv {
  getUser: Effect<Result<User, HttpError>>; // ← union
  logout: Effect<never>;
  openReauthPopup: Effect<unknown>;
  resolveReauth: Effect<never>;
}

export const mockAuthEnv: AuthEnv = {
  getUser: Effect.of((send) => {
    send(
      Result.ok<User, HttpError>({
        sub: 'dev-user',
        name: 'Dev User',
        email: 'dev@localhost',
      }),
    );
  }),
  logout: Effect.none(),
  openReauthPopup: Effect.none(),
  resolveReauth: Effect.none(),
};

export const testAuthEnv: AuthEnv = {
  ...mockAuthEnv,
  openReauthPopup: Effect.of((send) => {
    window.addEventListener('message', (e: MessageEvent<unknown>) => {
      send(e.data);
    });
  }),
};

export const liveAuthEnv: AuthEnv = {
  getUser: httpClient.get(
    '/auth/me',
    UserSchema,
    (user) => Result.ok<User, HttpError>(user),
    (err) => Result.err<User, HttpError>(err),
  ),
  logout: Effect.of((_send) => {
    window.location.href = '/auth/logout';
  }),

  openReauthPopup: Effect.of((send) => {
    console.log('openReauthPopup: registering listener');
    window.addEventListener('message', (e: MessageEvent<unknown>) => {
      console.log('message received', e.data);
      send(e.data);
    });
  }),
  resolveReauth: Effect.of((_send) => {
    httpClient.resolveReauth();
  }),
};
