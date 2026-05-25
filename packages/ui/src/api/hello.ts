import type { Effect } from '@arbor/common';
import { HelloResponseSchema, type HelloResponse } from '@arbor/common';
import type { HttpError } from '@arbor/common/http';
import { httpClient } from '../api/auth.interceptor.js';

export function fetchHello<A>(
  onSuccess: (value: HelloResponse) => A,
  onError: (error: HttpError) => A,
): Effect<A> {
  return httpClient.get('/api/hello', HelloResponseSchema, onSuccess, onError);
}
