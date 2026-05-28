import { describe, expect, expectTypeOf, it } from 'vitest';
import type { HttpContext, HttpMethod } from './http-context.js';

describe('HttpMethod', () => {
  it('is a union of HTTP verbs', () => {
    expectTypeOf<HttpMethod>().toEqualTypeOf<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>();
    expect(true).toBe(true);
  });
});

describe('HttpContext', () => {
  it('carries method, body, and response', () => {
    type GetUser = HttpContext<'GET', never, { 200: { id: string } }>;

    expectTypeOf<GetUser['method']>().toEqualTypeOf<'GET'>();
    expectTypeOf<GetUser['body']>().toEqualTypeOf<never>();
    expectTypeOf<GetUser['response']>().toEqualTypeOf<{ 200: { id: string } }>();
    expect(true).toBe(true);
  });

  it('supports a POST with body', () => {
    type CreateUser = HttpContext<'POST', { name: string }, { 201: { id: string } }>;

    expectTypeOf<CreateUser['method']>().toEqualTypeOf<'POST'>();
    expectTypeOf<CreateUser['body']>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<CreateUser['response']>().toEqualTypeOf<{ 201: { id: string } }>();
    expect(true).toBe(true);
  });

  it('supports multiple response status codes', () => {
    type Update = HttpContext<'PUT', { name: string }, { 200: { id: string }; 404: { error: string } }>;

    expectTypeOf<Update['response']>().toEqualTypeOf<{ 200: { id: string }; 404: { error: string } }>();
    expect(true).toBe(true);
  });
});
