// packages/common/src/http/client.ts

import { Deferred, Effect as Eff, Runtime } from 'effect';
import type z from 'zod';
import { Effect } from '../store/effect.js';
import { UnauthorizedError, type HttpError } from './errors.js';
import { httpDeleteRaw, httpGetRaw, httpPostRaw, httpPutRaw } from './fetch.js';

const runtime = Runtime.defaultRuntime;

export interface HttpClientOptions {
  onUnauthorized: () => void;
}

export interface HttpClient {
  get<T, A>(
    url: string,
    schema: z.ZodSchema<T>,
    onSuccess: (value: T) => A,
    onError: (error: HttpError) => A,
  ): Effect<A>;
  post<T, A>(
    url: string,
    body: unknown,
    schema: z.ZodSchema<T>,
    onSuccess: (value: T) => A,
    onError: (error: HttpError) => A,
  ): Effect<A>;
  put<T, A>(
    url: string,
    body: unknown,
    schema: z.ZodSchema<T>,
    onSuccess: (value: T) => A,
    onError: (error: HttpError) => A,
  ): Effect<A>;
  delete<T, A>(
    url: string,
    schema: z.ZodSchema<T>,
    onSuccess: (value: T) => A,
    onError: (error: HttpError) => A,
  ): Effect<A>;
  resolveReauth(): void;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  let deferred: Deferred.Deferred<void, never> | null = null;

  function getOrCreateDeferred(): Deferred.Deferred<void, never> {
    if (deferred == null) {
      deferred = Runtime.runSync(runtime, Deferred.make<void, never>());
      options.onUnauthorized();
    }
    return deferred;
  }

  function intercept<T, A>(
    makeEff: () => Eff.Effect<T, HttpError, never>,
    onSuccess: (value: T) => A,
    onError: (error: HttpError) => A,
  ): Effect<A> {
    return Effect.fromEff(
      makeEff().pipe(
        Eff.map(onSuccess),
        Eff.catchAll((e) => {
          if (e instanceof UnauthorizedError) {
            return Deferred.await(getOrCreateDeferred()).pipe(
              Eff.flatMap(() => makeEff()),
              Eff.map(onSuccess),
              Eff.catchAll((e2) => Eff.succeed(onError(e2))),
            );
          }
          return Eff.succeed(onError(e));
        }),
      ),
    );
  }

  return {
    get(url, schema, onSuccess, onError) {
      return intercept(() => httpGetRaw(url, schema), onSuccess, onError);
    },
    post(url, body, schema, onSuccess, onError) {
      return intercept(() => httpPostRaw(url, body, schema), onSuccess, onError);
    },
    put(url, body, schema, onSuccess, onError) {
      return intercept(() => httpPutRaw(url, body, schema), onSuccess, onError);
    },
    delete(url, schema, onSuccess, onError) {
      return intercept(() => httpDeleteRaw(url, schema), onSuccess, onError);
    },
    resolveReauth() {
      if (deferred != null) {
        Runtime.runFork(runtime, Deferred.succeed(deferred, undefined));
        deferred = null;
      }
    },
  };
}
