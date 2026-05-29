import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { route } from './define-routes.js';
import type {
  ChildUnion,
  Derive,
  Flatten,
  InferContext,
  InferRoute,
  RouteNode,
} from './route-node.js';

describe('Flatten', () => {
  it('cleans up an intersection', () => {
    type T = Flatten<{ tag: 'user' } & { id: string }>;
    expectTypeOf<T>().toEqualTypeOf<{ tag: 'user'; id: string }>();
  });

  it('cleans up a nested intersection', () => {
    type T = Flatten<{ tag: 'user' } & { child?: { tag: 'settings' } & { id: string } }>;
    expectTypeOf<T>().toEqualTypeOf<{
      tag: 'user';
      child?: { tag: 'settings' } & { id: string };
    }>();
  });

  it('is a no-op on a plain object', () => {
    type T = Flatten<{ tag: 'user'; id: string }>;
    expectTypeOf<T>().toEqualTypeOf<{ tag: 'user'; id: string }>();
  });
});

describe('InferRoute', () => {
  it('extracts the route type from a router', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stubRouter = {
      _type: undefined as never as { tag: 'users' } | { tag: 'user'; id: string },
    };

    expectTypeOf<InferRoute<typeof stubRouter>>().toEqualTypeOf<
      { tag: 'users' } | { tag: 'user'; id: string }
    >();
  });

  it('works with a nested route type', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stubRouter = {
      _type: undefined as never as
        | { tag: 'users'; child?: { tag: 'user'; id: string } }
        | { tag: 'org'; orgId: string },
    };

    expectTypeOf<InferRoute<typeof stubRouter>>().toEqualTypeOf<
      { tag: 'users'; child?: { tag: 'user'; id: string } } | { tag: 'org'; orgId: string }
    >();
  });
});

describe('InferContext', () => {
  it('extracts never from a route() node', () => {
    const node = route(z.object({ tag: z.literal('user'), id: z.string() }), ':id/');
    expect(node.context).toBeUndefined();
    expectTypeOf<InferContext<typeof node>>().toEqualTypeOf<never>();
  });

  it('extracts the context type when set', () => {
    type N = RouteNode<{ tag: 'user' }, [], { method: 'GET' }>;
    expectTypeOf<InferContext<N>>().toEqualTypeOf<{ method: 'GET' }>();
  });

  it('works with a complex context type', () => {
    interface Ctx {
      method: 'POST';
      body: { name: string };
      response: { 200: { id: string } };
    }
    type N = RouteNode<{ tag: 'create-user' }, [], Ctx>;
    expectTypeOf<InferContext<N>>().toEqualTypeOf<Ctx>();
  });
});

describe('Derive', () => {
  it('leaf node — no child field', () => {
    type N = RouteNode<{ tag: 'user'; id: string }>;
    expectTypeOf<Derive<N>>().toEqualTypeOf<{ tag: 'user'; id: string }>();
  });

  it('tagged node with children — optional child', () => {
    type Child = RouteNode<{ tag: 'user'; id: string }>;
    type N = RouteNode<{ tag: 'users' }, [Child]>;
    expectTypeOf<Derive<N>>().toEqualTypeOf<{
      tag: 'users';
      child?: { tag: 'user'; id: string };
    }>();
  });

  it('section node — required child', () => {
    type Child = RouteNode<{ tag: 'user'; id: string }>;
    type N = RouteNode<never, [Child]>;
    expectTypeOf<Derive<N>>().toEqualTypeOf<{
      child: { tag: 'user'; id: string };
    }>();
  });

  it('section node — child cannot be undefined', () => {
    type Child = RouteNode<{ tag: 'user'; id: string }>;
    type N = RouteNode<never, [Child]>;
    type D = Derive<N>;
    interface Key {
      child: { tag: 'user'; id: string };
    }

    expectTypeOf<Key>().toExtend<D>();
  });
});

describe('ChildUnion', () => {
  it('union of two leaves', () => {
    type C = [RouteNode<{ tag: 'users' }>, RouteNode<{ tag: 'org'; orgId: string }>];
    expectTypeOf<ChildUnion<C>>().toEqualTypeOf<{ tag: 'users' } | { tag: 'org'; orgId: string }>();
  });

  it('union including a section', () => {
    type C = [
      RouteNode<never, [RouteNode<{ tag: 'user'; id: string }>]>,
      RouteNode<{ tag: 'org'; orgId: string }>,
    ];
    expectTypeOf<ChildUnion<C>>().toEqualTypeOf<
      { child: { tag: 'user'; id: string } } | { tag: 'org'; orgId: string }
    >();
  });
});
