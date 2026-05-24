import type { Effect } from '@arbo/common';
import { HelloResponseSchema, type HelloResponse } from '@arbo/common';
import type { HttpError } from '@arbo/common/http';
import { httpClient } from '../api/auth.interceptor.js';

export function fetchHello<A>(
  onSuccess: (value: HelloResponse) => A,
  onError: (error: HttpError) => A,
): Effect<A> {
  return httpClient.get('/api/hello', HelloResponseSchema, onSuccess, onError);
}
