/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fc from 'fast-check';
import type z from 'zod';

// Zod v4 uses `schema._zod.def.type` as the type discriminant (string literal).
// This is a hand-rolled adapter since @fast-check/zod doesn't exist and
// zod-fast-check only supports Zod v3.

interface AnySchema { _zod?: { def?: Record<string, unknown> } }

function def(schema: unknown): Record<string, unknown> {
  return (schema as AnySchema)._zod?.def ?? {};
}

export function zodToArbitrary(schema: z.ZodType): fc.Arbitrary<unknown> {
  const d = def(schema);
  switch (d['type']) {
    case 'string':
      return fc.string();
    case 'number':
      return fc.integer();
    case 'boolean':
      return fc.boolean();
    case 'literal': {
      const values = d['values'] as unknown[];
      return values.length > 0 ? fc.constantFrom(...values) : fc.constant(null);
    }
    case 'enum': {
      const entries = d['entries'] as Record<string, unknown>;
      const vals = Object.values(entries);
      return vals.length > 0 ? fc.constantFrom(...vals) : fc.constant(null);
    }
    case 'object': {
      // shape may be a plain object or a lazy getter function (Zod v4 JIT mode)
      const shapeRaw = d['shape'] as Record<string, z.ZodType> | (() => Record<string, z.ZodType>);
      const shape: Record<string, z.ZodType> =
        typeof shapeRaw === 'function' ? shapeRaw() : shapeRaw;
      const record: Record<string, fc.Arbitrary<unknown>> = {};
      for (const [k, v] of Object.entries(shape)) {
        record[k] = zodToArbitrary(v);
      }
      return fc.record(record, { withDeletedKeys: false });
    }
    case 'array':
      return fc.array(zodToArbitrary(d['element'] as z.ZodType));
    case 'union':
    case 'intersection': {
      const options = d['options'] as z.ZodType[];
      if (options.length === 0) return fc.constant(undefined);
      return fc.oneof(...options.map(zodToArbitrary));
    }
    case 'optional': {
      const inner = zodToArbitrary(d['innerType'] as z.ZodType);
      // fc.option with nil:undefined produces T | undefined
      return fc.option(inner, { nil: undefined });
    }
    case 'nullable': {
      const inner = zodToArbitrary(d['innerType'] as z.ZodType);
      return fc.option(inner, { nil: null });
    }
    case 'default':
    case 'prefault':
    case 'catch':
    case 'transform':
    case 'pipe':
      // For wrapper types, generate from the inner type (fall back to schema itself).
      return zodToArbitrary((d['innerType'] as z.ZodType | undefined) ?? schema);
    default:
      // Fallback: produce a random JSON-serializable value
      return fc.jsonValue();
  }
}

// Generate an arbitrary for a ZodObject's non-tag fields (for path params).
export function zodObjectParamsArb(
  schema: z.ZodObject<any, any>,
  excludeKeys: string[],
): fc.Arbitrary<Record<string, unknown>> {
  const shape = schema.shape as Record<string, z.ZodType>;
  const record: Record<string, fc.Arbitrary<unknown>> = {};
  for (const [k, v] of Object.entries(shape)) {
    if (!excludeKeys.includes(k)) {
      record[k] = zodToArbitrary(v);
    }
  }
  return Object.keys(record).length > 0
    ? fc.record(record, { withDeletedKeys: false })
    : fc.constant({});
}
