import { Effect } from '@arbor/common';
import type { RouterAction, RouterEnv } from './router.env.js';
import type { Route } from './routes.js';

export function makeMockRouterEnv(initial?: Route): {
  env: RouterEnv;
  navigated: Route[];
  replaced: Route[];
  trigger: (action: RouterAction) => void;
} {
  let _send: ((action: RouterAction) => void) | null = null;
  const navigated: Route[] = [];
  const replaced: Route[] = [];

  const env: RouterEnv = {
    listen: Effect.of((send) => {
      _send = send;
      if (initial) send({ tag: 'route-changed', route: initial });
    }),

    navigate: (route) =>
      Effect.of((send) => {
        navigated.push(route);
        send({ tag: 'route-changed', route });
      }),

    navigateReplace: (route) =>
      Effect.of((send) => {
        replaced.push(route);
        send({ tag: 'route-changed', route });
      }),
  };

  return {
    env,
    navigated,
    replaced,
    trigger: (action) => _send?.(action),
  };
}
