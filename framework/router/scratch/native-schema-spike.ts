/**
 * Spike 133 — Native Schema Representation
 *
 * Claims to validate:
 *   Q1. Schema<T> achieves the same type inference as z.ZodType<T>
 *   Q2. toZod(schema) produces a correct Zod schema (compiled once at startup)
 *   Q3. Ergonomics compare favourably to z.object({...})
 *   Q4. "Zod opt-in" architecture: core has zero Zod dependency; Zod is a
 *       peer-opt-in via fromZod() adapter
 *
 * Run: tsc --noEmit --strict packages/router/scratch/native-schema-spike.ts
 * Run: tsc --diagnostics packages/router/scratch/native-schema-spike.ts
 *       (instantiation count should be << 100k)
 */

import * as z from 'zod';

// ─── 1. SCHEMA<T> TYPE SYSTEM ────────────────────────────────────────────────
//
// Each node carries `_type` as a phantom — same idiom as RouteNode._type.
// Runtime value is always `undefined as never`; TypeScript sees the declared T.

interface StringS  { readonly _type: string;  kind: 'string' }
interface NumberS  { readonly _type: number;  kind: 'number' }
interface BooleanS { readonly _type: boolean; kind: 'boolean' }

interface IntegerS { readonly _type: number; kind: 'integer'; min?: number; max?: number }

interface LiteralS<V extends string | number | boolean> {
  readonly _type: V
  kind: 'literal'
  value: V
}

interface ObjectS<T extends Record<string, unknown>> {
  readonly _type: T
  kind: 'object'
  fields: { [K in keyof T]: AnyS & { readonly _type: T[K] } }
}

interface ArrayS<T> {
  readonly _type: T[]
  kind: 'array'
  item: AnyS & { readonly _type: T }
}

interface OptionalS<T> {
  readonly _type: T | undefined
  kind: 'optional'
  inner: AnyS & { readonly _type: T }
}

interface NullableS<T> {
  readonly _type: T | null
  kind: 'nullable'
  inner: AnyS & { readonly _type: T }
}

interface UnionS<T> {
  readonly _type: T
  kind: 'union'
  members: (AnyS & { readonly _type: unknown })[]
}

interface EnumS<T extends string> {
  readonly _type: T
  kind: 'enum'
  values: T[]
}

// ─── Zod passthrough — the opt-in bridge ─────────────────────────────────────
//
// ZodS<T> is a first-class schema node. When present, the runtime validator
// delegates to Zod's .safeParse(). The *core* package never imports this node
// type directly — it lives in a separate `@arbor/router/zod` subpath, so Zod
// is only a hard dependency for consumers who explicitly call fromZod().

interface ZodS<T> {
  readonly _type: T
  kind: 'zod'
  zodSchema: z.ZodType<T>
}

// AnyS is the discriminated union of all schema variants.
type AnyS =
  | StringS
  | NumberS
  | BooleanS
  | IntegerS
  | LiteralS<string | number | boolean>
  | ObjectS<Record<string, unknown>>
  | ArrayS<unknown>
  | OptionalS<unknown>
  | NullableS<unknown>
  | UnionS<unknown>
  | EnumS<string>
  | ZodS<unknown>

// ─── 2. INFER<S> ─────────────────────────────────────────────────────────────

type Infer<S extends { readonly _type: unknown }> = S['_type']

// ─── 3. FACTORY FUNCTIONS ────────────────────────────────────────────────────

const phantom = undefined as never

function string(): StringS   { return { kind: 'string',  _type: phantom } }
function number(): NumberS   { return { kind: 'number',  _type: phantom } }
function boolean(): BooleanS { return { kind: 'boolean', _type: phantom } }

function integer(opts?: { min?: number; max?: number }): IntegerS {
  return { kind: 'integer', _type: phantom, ...opts }
}

function literal<V extends string | number | boolean>(value: V): LiteralS<V> {
  return { kind: 'literal', value, _type: phantom }
}

// Key inference test: TypeScript must infer T from the fields object.
function object<F extends Record<string, AnyS>>(
  fields: F,
): ObjectS<{ [K in keyof F]: Infer<F[K]> }> {
  return { kind: 'object', fields: fields as never, _type: phantom }
}

function array<S extends AnyS>(item: S): ArrayS<Infer<S>> {
  return { kind: 'array', item: item as never, _type: phantom }
}

function optional<S extends AnyS>(inner: S): OptionalS<Infer<S>> {
  return { kind: 'optional', inner: inner as never, _type: phantom }
}

function nullable<S extends AnyS>(inner: S): NullableS<Infer<S>> {
  return { kind: 'nullable', inner: inner as never, _type: phantom }
}

function union<T extends [AnyS, AnyS, ...AnyS[]]>(
  ...members: T
): UnionS<Infer<T[number]>> {
  return { kind: 'union', members, _type: phantom }
}

function enumOf<T extends string>(...values: T[]): EnumS<T> {
  return { kind: 'enum', values, _type: phantom }
}

// ─── Opt-in Zod bridge (would live in @arbor/router/zod, not core) ───────────

function fromZod<T>(zodSchema: z.ZodType<T>): ZodS<T> {
  return { kind: 'zod', zodSchema, _type: phantom }
}

// ─── 4. Q1 TYPE INFERENCE TESTS ──────────────────────────────────────────────
//
// These assignments only compile if TypeScript infers the correct T.

type AssertEqual<A, B> =
  [A] extends [B] ? ([B] extends [A] ? true : false) : false

declare function assertEq<const A, const B>(_check: AssertEqual<A, B>): void

// Primitives
assertEq<Infer<StringS>,  string>(true)
assertEq<Infer<NumberS>,  number>(true)
assertEq<Infer<BooleanS>, boolean>(true)

// Literal
const lit = literal('admin' as const)
assertEq<Infer<typeof lit>, 'admin'>(true)

// Object — the core inference claim
const userSchema = object({ id: string(), age: number(), active: boolean() })
assertEq<Infer<typeof userSchema>, { id: string; age: number; active: boolean }>(true)

// Nested object
const nestedSchema = object({ user: object({ id: string() }), tags: array(string()) })
assertEq<Infer<typeof nestedSchema>, { user: { id: string }; tags: string[] }>(true)

// Optional + nullable
const maybeNum = optional(number())
assertEq<Infer<typeof maybeNum>, number | undefined>(true)

const nullId = nullable(string())
assertEq<Infer<typeof nullId>, string | null>(true)

// Union
const strOrNum = union(string(), number())
assertEq<Infer<typeof strOrNum>, string | number>(true)

// Enum
const role = enumOf('admin', 'user', 'guest')
assertEq<Infer<typeof role>, 'admin' | 'user' | 'guest'>(true)

// Zod passthrough — type flows through unchanged
const zodEmail = fromZod(z.string().email())
assertEq<Infer<typeof zodEmail>, string>(true)

const zodRefined = fromZod(z.object({ id: z.string().uuid(), age: z.number().int().min(0) }))
assertEq<Infer<typeof zodRefined>, { id: string; age: number }>(true)

// ─── 5. ROUTE() SIMULATION ───────────────────────────────────────────────────
//
// Mirrors the actual route() signature but using AnyS instead of z.ZodObject.
// The key: Infer<S> flows into RouteNode<R, ...> the same way z.infer<S> does.

interface RouteSimple<R> {
  readonly _type: R   // phantom, same as RouteNode
  path: string
  schema: AnyS
}

function route<S extends AnyS>(schema: S, path: string): RouteSimple<Infer<S>> {
  return { _type: phantom, path, schema }
}

// Q5: Does route() correctly propagate the inferred type?
const userRoute = route(userSchema, ':id')
assertEq<typeof userRoute['_type'], { id: string; age: number; active: boolean }>(true)

// Opt-in Zod route: same ergonomics, Zod features preserved
const emailRoute = route(fromZod(z.object({ email: z.string().email() })), ':email')
assertEq<typeof emailRoute['_type'], { email: string }>(true)

// ─── 6. toZod() — COMPILE NATIVE SCHEMA → ZOD ───────────────────────────────
//
// Used once at server startup. Core never calls this if validation is skipped.

function toZod<S extends AnyS>(schema: S): z.ZodType<Infer<S>> {
  switch (schema.kind) {
    case 'string':   return z.string() as z.ZodType<Infer<S>>
    case 'number':   return z.number() as z.ZodType<Infer<S>>
    case 'boolean':  return z.boolean() as z.ZodType<Infer<S>>
    case 'integer':  {
      let s = z.number().int()
      if (schema.min !== undefined) s = s.min(schema.min)
      if (schema.max !== undefined) s = s.max(schema.max)
      return s as z.ZodType<Infer<S>>
    }
    case 'literal':  return z.literal(schema.value) as z.ZodType<Infer<S>>
    case 'optional': return toZod(schema.inner).optional() as z.ZodType<Infer<S>>
    case 'nullable': return toZod(schema.inner).nullable() as z.ZodType<Infer<S>>
    case 'array':    return z.array(toZod(schema.item)) as z.ZodType<Infer<S>>
    case 'enum':     return z.enum(schema.values as [string, ...string[]]) as z.ZodType<Infer<S>>
    case 'union': {
      const [a, b, ...rest] = schema.members
      if (a === undefined || b === undefined) throw new Error('union needs >= 2 members')
      return z.union([toZod(a as AnyS), toZod(b as AnyS), ...rest.map(m => toZod(m as AnyS))]) as z.ZodType<Infer<S>>
    }
    case 'object': {
      const shape: Record<string, z.ZodTypeAny> = {}
      for (const [k, v] of Object.entries(schema.fields)) {
        shape[k] = toZod(v as AnyS)
      }
      return z.object(shape) as z.ZodType<Infer<S>>
    }
    case 'zod':
      return schema.zodSchema as z.ZodType<Infer<S>>
  }
}

// Smoke-test: compile userSchema to Zod and parse a value
const zodUser = toZod(userSchema)
const result = zodUser.safeParse({ id: 'abc', age: 30, active: true })
if (!result.success) throw new Error('toZod smoke-test failed')

// ─── 7. LIGHTWEIGHT BUILT-IN VALIDATOR (no Zod required) ─────────────────────
//
// Covers the common cases. ZodS delegates to Zod; everything else is native.
// This means @arbor/router core can drop zod from dependencies entirely.

type ValidationError = { path: string[]; message: string }
type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] }

function validate<S extends AnyS>(schema: S, data: unknown, path: string[] = []): ValidationResult<Infer<S>> {
  const fail = (msg: string): ValidationResult<Infer<S>> =>
    ({ ok: false, errors: [{ path, message: msg }] })

  switch (schema.kind) {
    case 'string':
      return typeof data === 'string' ? { ok: true, value: data as Infer<S> } : fail('expected string')
    case 'number':
      return typeof data === 'number' ? { ok: true, value: data as Infer<S> } : fail('expected number')
    case 'boolean':
      return typeof data === 'boolean' ? { ok: true, value: data as Infer<S> } : fail('expected boolean')
    case 'integer':
      if (typeof data !== 'number' || !Number.isInteger(data)) return fail('expected integer')
      if (schema.min !== undefined && data < schema.min) return fail(`min ${schema.min}`)
      if (schema.max !== undefined && data > schema.max) return fail(`max ${schema.max}`)
      return { ok: true, value: data as Infer<S> }
    case 'literal':
      return data === schema.value ? { ok: true, value: data as Infer<S> } : fail(`expected ${JSON.stringify(schema.value)}`)
    case 'optional':
      return data === undefined ? { ok: true, value: undefined as Infer<S> } : validate(schema.inner as AnyS, data, path) as ValidationResult<Infer<S>>
    case 'nullable':
      return data === null ? { ok: true, value: null as Infer<S> } : validate(schema.inner as AnyS, data, path) as ValidationResult<Infer<S>>
    case 'array': {
      if (!Array.isArray(data)) return fail('expected array')
      const out: unknown[] = []
      const errors: ValidationError[] = []
      for (let i = 0; i < data.length; i++) {
        const r = validate(schema.item as AnyS, data[i], [...path, String(i)])
        if (r.ok) out.push(r.value); else errors.push(...r.errors)
      }
      return errors.length ? { ok: false, errors } : { ok: true, value: out as Infer<S> }
    }
    case 'enum':
      return (schema.values as unknown[]).includes(data)
        ? { ok: true, value: data as Infer<S> }
        : fail(`expected one of ${schema.values.join(', ')}`)
    case 'union': {
      for (const member of schema.members) {
        const r = validate(member as AnyS, data, path)
        if (r.ok) return r as ValidationResult<Infer<S>>
      }
      return fail('no union member matched')
    }
    case 'object': {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return fail('expected object')
      const out: Record<string, unknown> = {}
      const errors: ValidationError[] = []
      for (const [k, fieldSchema] of Object.entries(schema.fields)) {
        const r = validate(fieldSchema as AnyS, (data as Record<string, unknown>)[k], [...path, k])
        if (r.ok) out[k] = r.value; else errors.push(...r.errors)
      }
      return errors.length ? { ok: false, errors } : { ok: true, value: out as Infer<S> }
    }
    case 'zod': {
      const r = (schema.zodSchema as z.ZodType).safeParse(data)
      return r.success
        ? { ok: true, value: r.data as Infer<S> }
        : { ok: false, errors: r.error.errors.map(e => ({ path: [...path, ...e.path.map(String)], message: e.message })) }
    }
  }
}

// Built-in validator smoke-test
const nativeResult = validate(userSchema, { id: 'u1', age: 42, active: true })
if (!nativeResult.ok) throw new Error('native validate failed')

const nativeFailResult = validate(userSchema, { id: 42, age: 'x', active: true })
if (nativeFailResult.ok) throw new Error('native validate should have failed')

// ZodS falls through to Zod's own validator
const zodResult = validate(zodRefined, { id: '550e8400-e29b-41d4-a716-446655440000', age: 25 })
if (!zodResult.ok) throw new Error('zod passthrough validate failed')

// ─── 8. Q3 ERGONOMICS COMPARISON ─────────────────────────────────────────────
//
// Three ways to express "user has a string id, an integer age ≥ 0, and a role".

// (A) Zod today
const zodWay = z.object({
  id: z.string(),
  age: z.number().int().min(0),
  role: z.enum(['admin', 'user', 'guest']),
})

// (B) Native schema — factory functions (preferred)
const nativeWay = object({
  id: string(),
  age: integer({ min: 0 }),
  role: enumOf('admin', 'user', 'guest'),
})

// (C) Native schema explicit — raw object literals (verbose, not recommended)
const explicitWay: ObjectS<{ id: string; age: number; role: 'admin' | 'user' | 'guest' }> = {
  kind: 'object',
  _type: phantom,
  fields: {
    id:   { kind: 'string',  _type: phantom },
    age:  { kind: 'integer', _type: phantom, min: 0 },
    role: { kind: 'enum',    _type: phantom, values: ['admin', 'user', 'guest'] },
  },
}

// Unused vars — referenced only for type checking
void zodWay; void nativeWay; void explicitWay

// ─── 9. OPT-IN ZOD ARCHITECTURE DEMONSTRATION ────────────────────────────────
//
// Scenario: a route that needs .refine() for cross-field validation.
// Native schema cannot express this (it has no .refine() equivalent).
// The user opts in to Zod only for that route.

const complexBodySchema = fromZod(
  z.object({
    password: z.string().min(8),
    confirm:  z.string(),
  }).refine(d => d.password === d.confirm, { message: 'passwords must match' }),
)

// route() accepts it transparently — same generic shape
const updatePasswordRoute = route(complexBodySchema, 'update-password')
assertEq<typeof updatePasswordRoute['_type'], { password: string; confirm: string }>(true)

// validate() delegates to Zod's safeParse for ZodS nodes
const badPwResult = validate(complexBodySchema, { password: 'abc', confirm: 'xyz' })
if (badPwResult.ok) throw new Error('should have failed: too short + mismatch')

console.log('All spike assertions passed.')

/*
 * ─── DECISION MEMO ───────────────────────────────────────────────────────────
 *
 * Q1 — Is inference achievable without `any` in the implementation?
 *   YES, with one caveat. `Infer<S>` is clean: `S['_type']`. Factory function
 *   return types are inferred entirely from the generic constraint on `fields`.
 *   The only `as never` casts are in factory function bodies (same idiom as
 *   RouteNode._type) and a few `as z.ZodType<Infer<S>>` in toZod() which are
 *   structurally unavoidable due to the distributive conditional narrowing gap
 *   in switch statements.
 *
 * Q2 — What's lost relative to Zod?
 *   - .refine() / .superRefine() — cross-field validators. Addressed by fromZod().
 *   - .transform() — schema-level data coercion. Not in native.
 *   - .brand() — nominal typing. Could add BrandS<T, B> later.
 *   - Zod's error formatting / i18n. Native errors are plain strings.
 *   - .email(), .url(), .uuid(), .regex() — format validators. Addressable with
 *     a StringS constraint bag (StringS<Constraints>) in a follow-on plan.
 *   The native validator (validate()) covers the ~80% case. The 20% (refine,
 *   transform, format validators) is handled by fromZod() with full Zod features.
 *
 * Q3 — Ergonomics?
 *   Factory form (B) is slightly more verbose than Zod for complex chains
 *   (z.string().email().min(5) vs. string() with no chaining). Chains can be
 *   added later. For simple route params — the dominant case — it is identical.
 *
 * Q4 — Transparent compilation (option 3 from plan) sufficient?
 *   Viable but not recommended. The cleanest path is "native primary, Zod opt-in":
 *
 *   Architecture recommendation:
 *     - @arbor/router core: zero Zod dependency. Uses AnyS / Infer<S>.
 *       Includes the built-in validate() for runtime use.
 *     - @arbor/router/zod (subpath export): exports fromZod() + toZod().
 *       Peer-depends on zod. Consumers import this only if they need Zod features.
 *     - Existing users: route() continues to accept ZodS<T> via fromZod(schema).
 *       One-line migration per route: wrap z.object({...}) in fromZod().
 *       This is a breaking change to the route() signature but straightforward.
 *
 * Q5 — Serialization advantage?
 *   YES. ObjectS / ArrayS / etc. are plain JSON-serializable. plan-129
 *   (contract diff) can serialize/diff natively without zod-to-json-schema.
 *   The .refine() loss in plan-127 is fully addressed: ZodS nodes are opaque
 *   (cannot be serialized/diffed structurally — same limitation as before),
 *   but native nodes are fully transparent. Users who need contractual
 *   isomorphism can avoid fromZod() for boundary schemas.
 *
 * Recommendation: PROCEED as new primary schema API.
 *   - Native schema for the common case (no Zod dependency, fully serializable).
 *   - fromZod() opt-in for complex validation (Zod features, no type loss).
 *   - Implementation wave: touches core/, contexts/, openapi/, all builders.
 *     Plan as a dedicated wave with backward-compat deprecation cycle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
