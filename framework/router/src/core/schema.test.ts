import { describe, expect, it } from 'vitest';
import {
  type AnyObjectSchema,
  boolean,
  integer,
  literal,
  number,
  object,
  optional,
  parseObjectSchema,
  string,
} from './schema.js';

describe('parseObjectSchema', () => {
  describe('success path', () => {
    it('parses all required fields', () => {
      const schema = object({ tag: literal('user'), id: string(), active: boolean() });
      const result = parseObjectSchema(schema, { tag: 'user', id: '42', active: true });
      expect(result).toEqual({ success: true, data: { tag: 'user', id: '42', active: true } });
    });

    it('empty schema against empty input', () => {
      const schema = object({});
      expect(parseObjectSchema(schema, {})).toEqual({ success: true, data: {} });
    });
  });

  describe('failure path', () => {
    it('returns issues for a wrong-type field', () => {
      const schema = object({ id: string() });
      const result = parseObjectSchema(schema, { id: 42 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toMatchObject({ path: ['id'] });
      }
    });

    it('accumulates issues for multiple failing fields', () => {
      const schema = object({ a: string(), b: integer() });
      const result = parseObjectSchema(schema, { a: 1, b: 'x' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toHaveLength(2);
        expect(result.issues.map((i) => i.path?.[0])).toEqual(expect.arrayContaining(['a', 'b']));
      }
    });
  });

  describe('null / non-object input (validateNative guard)', () => {
    it('treats null input as empty object', () => {
      const schema = object({ q: optional(string()) });
      const result = parseObjectSchema(schema, null);
      expect(result.success).toBe(true);
    });
  });
});

describe('parseScalar cases', () => {
  const parse = (schema: AnyObjectSchema, input: Record<string, unknown>) =>
    parseObjectSchema(schema, input);

  describe('string', () => {
    it('accepts a string', () => {
      expect(parse(object({ v: string() }), { v: 'hello' }).success).toBe(true);
    });
    it('rejects a number', () => {
      expect(parse(object({ v: string() }), { v: 1 }).success).toBe(false);
    });
  });

  describe('number', () => {
    it('accepts an integer value', () => {
      expect(parse(object({ v: number() }), { v: 3.14 }).success).toBe(true);
    });
    it('rejects a string', () => {
      expect(parse(object({ v: number() }), { v: '1' }).success).toBe(false);
    });
  });

  describe('integer', () => {
    it('accepts an integer value', () => {
      expect(parse(object({ v: integer() }), { v: 42 }).success).toBe(true);
    });
    it('rejects a string (no coercion)', () => {
      expect(parse(object({ v: integer() }), { v: '42' }).success).toBe(false);
    });
  });

  describe('boolean', () => {
    it('accepts true/false', () => {
      expect(parse(object({ v: boolean() }), { v: false }).success).toBe(true);
    });
    it('rejects a string', () => {
      expect(parse(object({ v: boolean() }), { v: 'true' }).success).toBe(false);
    });
  });

  describe('literal', () => {
    it('accepts matching string literal', () => {
      expect(parse(object({ v: literal('foo') }), { v: 'foo' }).success).toBe(true);
    });
    it('rejects non-matching string', () => {
      expect(parse(object({ v: literal('foo') }), { v: 'bar' }).success).toBe(false);
    });
    it('accepts matching number literal', () => {
      expect(parse(object({ v: literal(1) }), { v: 1 }).success).toBe(true);
    });
    it('accepts matching boolean literal', () => {
      expect(parse(object({ v: literal(true) }), { v: true }).success).toBe(true);
    });
    it('rejects wrong boolean literal', () => {
      expect(parse(object({ v: literal(true) }), { v: false }).success).toBe(false);
    });
  });

  describe('optional', () => {
    it('undefined is accepted and returned as undefined', () => {
      const result = parse(object({ v: optional(string()) }), {});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data['v']).toBeUndefined();
    });
    it('null is treated as absent', () => {
      const result = parse(object({ v: optional(string()) }), { v: null });
      expect(result.success).toBe(true);
    });
    it('present value is validated against inner schema', () => {
      expect(parse(object({ v: optional(string()) }), { v: 'ok' }).success).toBe(true);
      expect(parse(object({ v: optional(string()) }), { v: 42 }).success).toBe(false);
    });
    it('wraps optional(integer())', () => {
      expect(parse(object({ n: optional(integer()) }), { n: 7 }).success).toBe(true);
      expect(parse(object({ n: optional(integer()) }), { n: 'seven' }).success).toBe(false);
    });
  });

  describe('brand', () => {
    it('delegates to inner schema and accepts a valid value', () => {
      const branded = { kind: 'brand' as const, inner: string(), brand: 'UserId' };
      expect(parse(object({ v: branded }), { v: 'u-1' }).success).toBe(true);
    });
    it('delegates to inner schema and rejects an invalid value', () => {
      const branded = { kind: 'brand' as const, inner: integer(), brand: 'TaskId' };
      expect(parse(object({ v: branded }), { v: 'not-a-number' }).success).toBe(false);
    });
  });
});
