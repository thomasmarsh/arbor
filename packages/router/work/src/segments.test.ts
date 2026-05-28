import { describe, expect, it } from 'vitest';
import { matchSegments, parseSegments } from './segments.js';

describe('parseSegments', () => {
  describe('literals', () => {
    it('parses a single literal', () => {
      expect(parseSegments('users/')).toEqual([{ kind: 'lit', value: 'users' }]);
    });

    it('parses multiple literals', () => {
      expect(parseSegments('orgs/projects/')).toEqual([
        { kind: 'lit', value: 'orgs' },
        { kind: 'lit', value: 'projects' },
      ]);
    });
  });

  describe('params', () => {
    it('parses a string param', () => {
      expect(parseSegments(':id/')).toEqual([{ kind: 'str', name: 'id' }]);
    });

    it('parses a number param', () => {
      expect(parseSegments('#id/')).toEqual([{ kind: 'num', name: 'id' }]);
    });

    it('parses an optional string param', () => {
      expect(parseSegments(':id?/')).toEqual([{ kind: 'opt-str', name: 'id' }]);
    });

    it('parses an optional number param', () => {
      expect(parseSegments('#id?/')).toEqual([{ kind: 'opt-num', name: 'id' }]);
    });

    it('parses a wildcard', () => {
      expect(parseSegments('*rest/')).toEqual([{ kind: 'wildcard', name: 'rest' }]);
    });
  });

  describe('mixed', () => {
    it('parses literal then param', () => {
      expect(parseSegments('users/:id/')).toEqual([
        { kind: 'lit', value: 'users' },
        { kind: 'str', name: 'id' },
      ]);
    });

    it('parses literal then number param then literal', () => {
      expect(parseSegments('orgs/#id/projects/')).toEqual([
        { kind: 'lit', value: 'orgs' },
        { kind: 'num', name: 'id' },
        { kind: 'lit', value: 'projects' },
      ]);
    });

    it('parses optional param followed by wildcard', () => {
      expect(parseSegments(':id?/*rest/')).toEqual([
        { kind: 'opt-str', name: 'id' },
        { kind: 'wildcard', name: 'rest' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles empty path', () => {
      expect(parseSegments('')).toEqual([]);
    });

    it('handles root slash only', () => {
      expect(parseSegments('/')).toEqual([]);
    });

    it('handles path without trailing slash', () => {
      expect(parseSegments('users')).toEqual([{ kind: 'lit', value: 'users' }]);
    });
  });
});

describe('matchSegments', () => {
  describe('literals', () => {
    it('matches a literal', () => {
      const segs = parseSegments('users/');
      expect(matchSegments(segs, ['users'], {})).toEqual({
        params: {},
        rest: [],
      });
    });

    it('fails a wrong literal', () => {
      const segs = parseSegments('users/');
      expect(matchSegments(segs, ['orgs'], {})).toBeNull();
    });

    it('leaves unmatched segments in rest', () => {
      const segs = parseSegments('users/');
      expect(matchSegments(segs, ['users', '123'], {})).toEqual({
        params: {},
        rest: ['123'],
      });
    });
  });

  describe('required params', () => {
    it('captures a string param', () => {
      const segs = parseSegments(':id/');
      expect(matchSegments(segs, ['123'], {})).toEqual({
        params: { id: '123' },
        rest: [],
      });
    });

    it('captures a number param', () => {
      const segs = parseSegments('#id/');
      expect(matchSegments(segs, ['42'], {})).toEqual({
        params: { id: 42 },
        rest: [],
      });
    });

    it('fails a non-numeric number param', () => {
      const segs = parseSegments('#id/');
      expect(matchSegments(segs, ['abc'], {})).toBeNull();
    });

    it('fails when required param is missing', () => {
      const segs = parseSegments(':id/');
      expect(matchSegments(segs, [], {})).toBeNull();
    });
  });

  describe('optional params', () => {
    it('captures an optional string param when present', () => {
      const segs = parseSegments(':id?/');
      expect(matchSegments(segs, ['123'], {})).toEqual({
        params: { id: '123' },
        rest: [],
      });
    });

    it('skips an optional string param when absent', () => {
      const segs = parseSegments(':id?/');
      expect(matchSegments(segs, [], {})).toEqual({
        params: {},
        rest: [],
      });
    });

    it('captures an optional number param when present', () => {
      const segs = parseSegments('#id?/');
      expect(matchSegments(segs, ['42'], {})).toEqual({
        params: { id: 42 },
        rest: [],
      });
    });

    it('skips an optional number param when not a number', () => {
      const segs = parseSegments('#id?/');
      expect(matchSegments(segs, ['abc'], {})).toEqual({
        params: {},
        rest: ['abc'],
      });
    });
  });

  describe('wildcard', () => {
    it('captures all remaining segments', () => {
      const segs = parseSegments('*rest/');
      expect(matchSegments(segs, ['a', 'b', 'c'], {})).toEqual({
        params: { rest: ['a', 'b', 'c'] },
        rest: [],
      });
    });

    it('captures zero remaining segments', () => {
      const segs = parseSegments('*rest/');
      expect(matchSegments(segs, [], {})).toEqual({
        params: { rest: [] },
        rest: [],
      });
    });

    it('captures after a literal', () => {
      const segs = parseSegments('files/*rest/');
      expect(matchSegments(segs, ['files', 'a', 'b'], {})).toEqual({
        params: { rest: ['a', 'b'] },
        rest: [],
      });
    });
  });

  describe('mixed', () => {
    it('matches literal then required param', () => {
      const segs = parseSegments('users/:id/');
      expect(matchSegments(segs, ['users', '123', 'settings'], {})).toEqual({
        params: { id: '123' },
        rest: ['settings'],
      });
    });
    it('accumulates inherited params', () => {
      const segs = parseSegments('#projectId/');
      expect(matchSegments(segs, ['42'], { orgId: 'acme' })).toEqual({
        params: { orgId: 'acme', projectId: 42 },
        rest: [],
      });
    });
  });
});
