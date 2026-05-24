import { Effect as Eff } from 'effect';
import type z from 'zod';
import {
  ForbiddenError,
  NetworkError,
  ParseError,
  StatusError,
  UnauthorizedError,
  type HttpError,
} from './errors.js';

function doFetch(url: string, options?: RequestInit): Eff.Effect<Response, NetworkError, never> {
  return Eff.tryPromise({
    try: () =>
      fetch(url, {
        ...options,
        headers: { 'content-type': 'application/json', ...options?.headers },
      }),
    catch: (e) => new NetworkError({ message: e instanceof Error ? e.message : String(e) }),
  });
}

function parseResponse<T>(res: Response, schema: z.ZodSchema<T>): Eff.Effect<T, HttpError, never> {
  if (res.status === 401) return Eff.fail(new UnauthorizedError());
  if (res.status === 403) return Eff.fail(new ForbiddenError());
  if (!res.ok) return Eff.fail(new StatusError({ code: res.status, message: res.statusText }));
  return Eff.tryPromise({
    try: () => res.json() as Promise<unknown>,
    catch: (e) => new ParseError({ message: e instanceof Error ? e.message : String(e) }),
  }).pipe(
    Eff.flatMap((json) => {
      const parsed = schema.safeParse(json);
      return parsed.success
        ? Eff.succeed(parsed.data)
        : Eff.fail(new ParseError({ message: parsed.error.message }));
    }),
  );
}

export function httpGetRaw<T>(
  url: string,
  schema: z.ZodSchema<T>,
): Eff.Effect<T, HttpError, never> {
  return doFetch(url).pipe(Eff.flatMap((res) => parseResponse(res, schema)));
}

export function httpPostRaw<T>(
  url: string,
  body: unknown,
  schema: z.ZodSchema<T>,
): Eff.Effect<T, HttpError, never> {
  return doFetch(url, { method: 'POST', body: JSON.stringify(body) }).pipe(
    Eff.flatMap((res) => parseResponse(res, schema)),
  );
}

export function httpPutRaw<T>(
  url: string,
  body: unknown,
  schema: z.ZodSchema<T>,
): Eff.Effect<T, HttpError, never> {
  return doFetch(url, { method: 'PUT', body: JSON.stringify(body) }).pipe(
    Eff.flatMap((res) => parseResponse(res, schema)),
  );
}

export function httpDeleteRaw<T>(
  url: string,
  schema: z.ZodSchema<T>,
): Eff.Effect<T, HttpError, never> {
  return doFetch(url, { method: 'DELETE' }).pipe(Eff.flatMap((res) => parseResponse(res, schema)));
}
