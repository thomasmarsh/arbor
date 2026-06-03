import { Effect, Result } from '@arbor/common';
import type { HelloResponse } from '@arbor/app-common';
import { NetworkError } from '@arbor/common/http';
import { fetchHello } from './api/hello';

export interface CounterEnv {
  fetchHello: Effect<Result<HelloResponse, string>>;
  sleep: Effect<undefined>;
}

export const liveCounterEnv: CounterEnv = {
  fetchHello: fetchHello(
    (hello) => Result.ok(hello),
    (err) =>
      Result.err<HelloResponse, string>(
        err instanceof NetworkError ? err.message : String(err),
      ),
  ),
  sleep: Effect.sleep(1000),
};
