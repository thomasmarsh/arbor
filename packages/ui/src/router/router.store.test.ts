import { describe, expect, it } from 'vitest';
import { makeMockRouterEnv } from './router.env.mock.js';

describe('router env mock', () => {
  it('sends initial route on listen', () => {
    const received: unknown[] = [];
    const { env } = makeMockRouterEnv({ tag: 'users' });

    env.listen.unsafeRun((action) => received.push(action));

    expect(received).toEqual([{ tag: 'route-changed', route: { tag: 'users' } }]);
  });

  it('records navigated routes', () => {
    const { env, navigated } = makeMockRouterEnv();

    env.navigate({ tag: 'user', id: '123' }).unsafeRun(() => {
      /* empty  */
    });

    expect(navigated).toEqual([{ tag: 'user', id: '123' }]);
  });

  it('records replaced routes', () => {
    const { env, replaced } = makeMockRouterEnv();

    env.navigateReplace({ tag: 'users' }).unsafeRun(() => {
      /* empty */
    });

    expect(replaced).toEqual([{ tag: 'users' }]);
  });

  it('sends route-changed on navigate', () => {
    const received: unknown[] = [];
    const { env } = makeMockRouterEnv();

    env.navigate({ tag: 'user', id: '42' }).unsafeRun((action) => received.push(action));

    expect(received).toEqual([{ tag: 'route-changed', route: { tag: 'user', id: '42' } }]);
  });
});
