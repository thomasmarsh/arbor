import { Effect } from '@arbor/common';
import type { Route } from './routes.js';
import { router } from './routes.js';

export type RouterAction =
  | { tag: 'route-changed'; route: Route }
  | { tag: 'route-not-found'; path: string };

export interface RouterEnv {
  listen: Effect<RouterAction>;
  navigate: (route: Route) => Effect<RouterAction>;
  navigateReplace: (route: Route) => Effect<RouterAction>;
}

function currentRoute(): RouterAction {
  const result = router.parse(new URL(window.location.href));
  return result.fold<RouterAction>(
    (route) => ({ tag: 'route-changed', route }),
    (_) => ({ tag: 'route-not-found', path: window.location.pathname }),
  );
}

export const liveRouterEnv: RouterEnv = {
  listen: Effect.of((send) => {
    window.addEventListener('popstate', () => {
      send(currentRoute());
    });
    send(currentRoute());
  }),

  navigate: (route) =>
    Effect.of(() => {
      window.history.pushState(null, '', router.print(route));
    }),

  navigateReplace: (route) =>
    Effect.of(() => {
      window.history.replaceState(null, '', router.print(route));
    }),
};
