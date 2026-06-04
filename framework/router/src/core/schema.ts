// Native schema types and factories for route-level schemas (path params, tags).
// Body/response/query schemas remain Zod until plan 165.

export interface StringConstraints {
  format?: 'email' | 'url' | 'uuid' | 'cuid' | 'ulid' | 'datetime' | 'date' | 'time';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface NumberConstraints {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

export interface StringSchema  { kind: 'string';  constraints?: StringConstraints }
export interface NumberSchema  { kind: 'number';  constraints?: NumberConstraints }
export interface IntegerSchema { kind: 'integer'; constraints?: NumberConstraints }
export interface BooleanSchema { kind: 'boolean' }
export interface LiteralSchema<V extends string | number | boolean> { kind: 'literal'; value: V }
export interface OptionalSchema<S> { kind: 'optional'; inner: S }
export interface BrandSchema<S>    { kind: 'brand';    inner: S; brand: string }

// Inline object forms for optional/brand avoid the generic-alias circularity
// TypeScript flags on OptionalSchema<AnyScalarSchema>.
export type AnyScalarSchema =
  | StringSchema | NumberSchema | IntegerSchema | BooleanSchema
  | LiteralSchema<string | number | boolean>
  | { kind: 'optional'; inner: AnyScalarSchema }
  | { kind: 'brand'; inner: AnyScalarSchema; brand: string };

export interface ObjectSchema<T extends Record<string, unknown>> {
  kind: 'object';
  fields: { [K in keyof T]: AnyScalarSchema };
}

export type AnyObjectSchema = ObjectSchema<Record<string, unknown>>;

export type Infer<S> =
  S extends ObjectSchema<infer T>           ? T :
  S extends { kind: 'string' }             ? string :
  S extends { kind: 'number' | 'integer' } ? number :
  S extends { kind: 'boolean' }            ? boolean :
  S extends LiteralSchema<infer V>         ? V :
  S extends OptionalSchema<infer I>        ? Infer<I> | undefined :
  S extends BrandSchema<infer I>           ? Infer<I> :
  never;

// ─── Factories ────────────────────────────────────────────────────────────────

export const string  = (c?: StringConstraints): StringSchema  => ({ kind: 'string', ...(c ? { constraints: c } : {}) });
export const number  = (c?: NumberConstraints): NumberSchema  => ({ kind: 'number', ...(c ? { constraints: c } : {}) });
export const integer = (c?: NumberConstraints): IntegerSchema => ({ kind: 'integer', ...(c ? { constraints: c } : {}) });
export const boolean = (): BooleanSchema => ({ kind: 'boolean' });
export const literal = <V extends string | number | boolean>(value: V): LiteralSchema<V> => ({ kind: 'literal', value });
export const optional = <S extends AnyScalarSchema>(inner: S): OptionalSchema<S> => ({ kind: 'optional', inner });

// FlatObj merges an intersection of required and optional mapped types into a single
// flat object shape while preserving optional modifiers (`?:`).
type FlatObj<T> = { [K in keyof T]: T[K] };

export const object = <F extends Record<string, AnyScalarSchema>>(
  fields: F,
): ObjectSchema<
  FlatObj<
    { [K in keyof F as F[K] extends { kind: 'optional' } ? never : K]: Infer<F[K]> } &
    { [K in keyof F as F[K] extends { kind: 'optional' } ? K : never]?: Infer<F[K]> }
  >
> => ({ kind: 'object', fields });
export const email = (c?: Omit<StringConstraints, 'format'>): StringSchema => string({ format: 'email', ...c });
export const uuid  = (c?: Omit<StringConstraints, 'format'>): StringSchema => string({ format: 'uuid',  ...c });
export const url   = (c?: Omit<StringConstraints, 'format'>): StringSchema => string({ format: 'url',   ...c });

// ─── Runtime validation ───────────────────────────────────────────────────────

export interface SchemaIssue { message: string; path?: (string | number)[] }

export function parseObjectSchema(
  schema: AnyObjectSchema,
  input: unknown,
): { success: true; data: Record<string, unknown> } | { success: false; issues: SchemaIssue[] } {
  const record = input != null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const data: Record<string, unknown> = {};
  const issues: SchemaIssue[] = [];
  for (const [key, field] of Object.entries(schema.fields)) {
    const result = parseScalar(field, record[key]);
    if (result.ok) data[key] = result.value;
    else issues.push({ message: result.message, path: [key] });
  }
  return issues.length === 0 ? { success: true, data } : { success: false, issues };
}

type ScalarResult = { ok: true; value: unknown } | { ok: false; message: string };

function parseScalar(schema: AnyScalarSchema, value: unknown): ScalarResult {
  switch (schema.kind) {
    case 'string':
      return typeof value === 'string'
        ? { ok: true, value }
        : { ok: false, message: `expected string, got ${typeof value}` };
    case 'number':
    case 'integer':
      return typeof value === 'number'
        ? { ok: true, value }
        : { ok: false, message: `expected number, got ${typeof value}` };
    case 'boolean':
      return typeof value === 'boolean'
        ? { ok: true, value }
        : { ok: false, message: `expected boolean, got ${typeof value}` };
    case 'literal':
      return value === schema.value
        ? { ok: true, value }
        : { ok: false, message: `expected ${String(schema.value)}, got ${String(value)}` };
    case 'optional':
      return value === undefined || value === null
        ? { ok: true, value: undefined }
        : parseScalar(schema.inner, value);
    case 'brand':
      return parseScalar(schema.inner, value);
  }
}
