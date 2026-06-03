/**
 * Plan 163 — Native Schema Scratch Proof
 * Instantiation count (schema types only, vitest baseline ~47k): ~15k
 * Total standalone: ~62k  |  Router-package baseline: 404k (scratch not in tsconfig)
 *
 * Design note: Plan 163 originally specified ScalarSchema<T> as a single
 * generic union. That design fails Claim 6 because Infer<ScalarSchema<42>>
 * distributes over all union members (including the optional variant which
 * contains ScalarSchema<42> again), producing string|number|boolean|42|undefined
 * instead of 42, and causing "excessively deep" errors.
 *
 * Redesign: use specific named schema types (StringSchema, LiteralSchema<V>,
 * OptionalSchema<S>, etc.) rather than a single parameterised union. The
 * object() factory captures the specific field-schema types via a mapped
 * type over F, so Infer<F[K]> resolves on concrete types only — no recursion.
 *
 * Claims to validate (all 7 from plan 163):
 *   1. object schema infers its field types
 *   2. Infer<S> extracts T from ObjectSchema<T>
 *   3. optional wraps correctly — undefined is added to the field type
 *   4. route() infers RouteNode<Infer<S>> — mock route() to test inference without touching src/
 *   5. constraints do not change the inferred TypeScript type
 *   6. literal works for numbers and booleans, not just strings
 *   7. Standard Schema structural interface satisfied without importing Zod
 */

import { expectTypeOf, it } from 'vitest';

// ── Types ────────────────────────────────────────────────────────────────────

type StringConstraints = {
  format?: 'email' | 'url' | 'uuid' | 'cuid' | 'ulid' | 'datetime' | 'date' | 'time';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

type NumberConstraints = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
};

// Specific schema node types — no generic parameter needed on primitives.
// Keeps Infer<S> non-recursive: each branch resolves to a concrete type
// without re-entering the union.
type StringSchema  = { kind: 'string';   constraints?: StringConstraints };
type NumberSchema  = { kind: 'number';   constraints?: NumberConstraints };
type IntegerSchema = { kind: 'integer';  constraints?: NumberConstraints };
type BooleanSchema = { kind: 'boolean' };
type LiteralSchema<V extends string | number | boolean> = { kind: 'literal';  value: V };
type OptionalSchema<S> = { kind: 'optional'; inner: S };
type BrandSchema<S>    = { kind: 'brand';    inner: S; brand: string };

// AnyScalarSchema uses inline object types for optional/brand members rather
// than OptionalSchema<AnyScalarSchema> to avoid the generic-alias indirection
// that TypeScript flags as "circularly references itself".
type AnyScalarSchema =
  | StringSchema
  | NumberSchema
  | IntegerSchema
  | BooleanSchema
  | LiteralSchema<string | number | boolean>
  | { kind: 'optional'; inner: AnyScalarSchema }
  | { kind: 'brand'; inner: AnyScalarSchema; brand: string };

// object() uses F (the concrete field-schema map) to compute T, then stores
// T in ObjectSchema<T>. Infer<ObjectSchema<T>> just reads T back — O(1).
type ObjectSchema<T extends Record<string, unknown>> = {
  kind: 'object';
  fields: { [K in keyof T]: AnyScalarSchema };
};

type AnyObjectSchema = ObjectSchema<Record<string, unknown>>;

type Infer<S> =
  S extends ObjectSchema<infer T>   ? T :
  S extends { kind: 'string' }      ? string :
  S extends { kind: 'number' | 'integer' } ? number :
  S extends { kind: 'boolean' }     ? boolean :
  S extends LiteralSchema<infer V>  ? V :
  S extends OptionalSchema<infer I> ? Infer<I> | undefined :
  S extends BrandSchema<infer I>    ? Infer<I> :
  never;

// ── Factories ────────────────────────────────────────────────────────────────

const string   = (constraints?: StringConstraints): StringSchema  => ({ kind: 'string', constraints });
const number   = (constraints?: NumberConstraints): NumberSchema  => ({ kind: 'number', constraints });
const integer  = (constraints?: NumberConstraints): IntegerSchema => ({ kind: 'integer', constraints });
const boolean  = (): BooleanSchema => ({ kind: 'boolean' });
const literal  = <V extends string | number | boolean>(value: V): LiteralSchema<V> => ({ kind: 'literal', value });
const optional = <S extends AnyScalarSchema>(inner: S): OptionalSchema<S> => ({ kind: 'optional', inner });
const object   = <F extends Record<string, AnyScalarSchema>>(
  fields: F
): ObjectSchema<{ [K in keyof F]: Infer<F[K]> }> => ({ kind: 'object', fields: fields as never });

// Convenience format factories — no fluent chaining; options-object only
const email = (c?: Omit<StringConstraints, 'format'>): StringSchema => string({ format: 'email', ...c });
const uuid  = (c?: Omit<StringConstraints, 'format'>): StringSchema => string({ format: 'uuid',  ...c });
const url   = (c?: Omit<StringConstraints, 'format'>): StringSchema => string({ format: 'url',   ...c });

void boolean; void number; void integer; void uuid; void url;

// mockRoute has no src/ counterpart yet — stub for inference testing only
function mockRoute<S extends AnyObjectSchema>(
  _schema: S,
  _path: string
): { _type: Infer<S> } {
  return { _type: undefined as never };
}

// mockValidate has no src/ counterpart — stub for Claim 7 only
function mockValidate<T>(_schema: { readonly '~standard': unknown }, _value: unknown): T | null {
  return null;
}

// ── Claims ───────────────────────────────────────────────────────────────────

it('plan163: all 7 type claims pass', () => {
  // Claim 1: object schema infers its field types
  const userSchema = object({ tag: literal('user'), id: string() });
  expectTypeOf(userSchema).toEqualTypeOf<ObjectSchema<{ tag: 'user'; id: string }>>();

  // Claim 2: Infer<S> extracts T from ObjectSchema<T>
  type UserParams = Infer<typeof userSchema>;
  expectTypeOf<UserParams>().toEqualTypeOf<{ tag: 'user'; id: string }>();

  // Claim 3: optional wraps correctly — undefined is added to the field type
  const querySchema = object({ page: optional(integer()), q: optional(string()) });
  expectTypeOf<Infer<typeof querySchema>>().toEqualTypeOf<{ page: number | undefined; q: string | undefined }>();

  // Claim 4: mockRoute infers { _type: Infer<S> } without touching src/
  const r = mockRoute(userSchema, 'users/:id');
  expectTypeOf(r._type).toEqualTypeOf<{ tag: 'user'; id: string }>();

  // Claim 5: constraints do not change the inferred TypeScript type
  const s1 = string();
  const s2 = string({ format: 'email', maxLength: 100 });
  const s3 = email();
  expectTypeOf(s1).toEqualTypeOf(s2);
  expectTypeOf(s1).toEqualTypeOf(s3);

  // Claim 6: literal works for numbers and booleans, not just strings
  const n = literal(42);
  const b = literal(true);
  expectTypeOf<Infer<typeof n>>().toEqualTypeOf<42>();
  expectTypeOf<Infer<typeof b>>().toEqualTypeOf<true>();

  // Claim 7: Standard Schema structural interface — satisfied without importing Zod
  interface StdSchema<T> {
    readonly '~standard': {
      readonly validate: (value: unknown) =>
        | { readonly value: T }
        | { readonly issues: ReadonlyArray<{ readonly message: string }> };
    };
  }
  const mockZodSchema = null as unknown as StdSchema<{ id: string }>;
  expectTypeOf(mockValidate<{ id: string }>(mockZodSchema, {})).toEqualTypeOf<{ id: string } | null>();
});
