import { type Effect, type HelloResponse, Result } from '@arbo/common';
import { NetworkError } from '@arbo/common/http';
import { fetchHello } from './api/hello';

export interface CounterEnv {
  fetchHello: Effect<Result<HelloResponse, string>>;
}


export const liveCounterEnv: CounterEnv = {
  fetchHello: fetchHello(
    (hello) => Result.success(hello),
    (err) =>
      Result.failure<HelloResponse, string>(
        err instanceof NetworkError ? err.message : String(err),
      ),
  ),
};
