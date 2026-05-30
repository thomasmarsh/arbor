import { describe, expect, it } from 'vitest';
import { type Segment, matchSegments, parseSegments } from './segments.js';

describe('parseSegments', () => {
  it.each([
    ['single literal', 'users/', [{ kind: 'lit', value: 'users' }]],
    [
      'multiple literals',
      'orgs/projects/',
      [
        { kind: 'lit', value: 'orgs' },
        { kind: 'lit', value: 'projects' },
      ],
    ],
    ['string param', ':id/', [{ kind: 'str', name: 'id' }]],
    ['number param', '#id/', [{ kind: 'num', name: 'id' }]],
    ['optional string param', ':id?/', [{ kind: 'opt-str', name: 'id' }]],
    ['optional number param', '#id?/', [{ kind: 'opt-num', name: 'id' }]],
    ['wildcard', '*rest/', [{ kind: 'wildcard', name: 'rest' }]],
    [
      'literal then param',
      'users/:id/',
      [
        { kind: 'lit', value: 'users' },
        { kind: 'str', name: 'id' },
      ],
    ],
    [
      'literal then number param then literal',
      'orgs/#id/projects/',
      [
        { kind: 'lit', value: 'orgs' },
        { kind: 'num', name: 'id' },
        { kind: 'lit', value: 'projects' },
      ],
    ],
    [
      'optional param followed by wildcard',
      ':id?/*rest/',
      [
        { kind: 'opt-str', name: 'id' },
        { kind: 'wildcard', name: 'rest' },
      ],
    ],
    ['empty path', '', []],
    ['root slash only', '/', []],
    ['path without trailing slash', 'users', [{ kind: 'lit', value: 'users' }]],
  ] satisfies [string, string, Segment[]][])(
    'parses %s',
    (_, input, expected) => { expect(parseSegments(input)).toEqual(expected); },
  );
});

type MatchResult = { params: Record<string, unknown>; rest: string[] } | null;

describe('matchSegments', () => {
  it.each([
    ['literal match', 'users/', ['users'], {}, { params: {}, rest: [] }],
    ['wrong literal', 'users/', ['orgs'], {}, null],
    ['unmatched rest', 'users/', ['users', '123'], {}, { params: {}, rest: ['123'] }],
    ['captures string param', ':id/', ['123'], {}, { params: { id: '123' }, rest: [] }],
    ['captures number param', '#id/', ['42'], {}, { params: { id: 42 }, rest: [] }],
    ['fails non-numeric number param', '#id/', ['abc'], {}, null],
    ['fails missing required param', ':id/', [], {}, null],
    ['negative integer for num', '#id/', ['-5'], {}, { params: { id: -5 }, rest: [] }],
    ['captures optional string when present', ':id?/', ['123'], {}, { params: { id: '123' }, rest: [] }],
    ['skips optional string when absent', ':id?/', [], {}, { params: {}, rest: [] }],
    ['captures optional number when present', '#id?/', ['42'], {}, { params: { id: 42 }, rest: [] }],
    ['skips optional number when not a number', '#id?/', ['abc'], {}, { params: {}, rest: ['abc'] }],
    ['negative integer for opt-num', '#id?/', ['-5'], {}, { params: { id: -5 }, rest: [] }],
    ['wildcard captures all remaining', '*rest/', ['a', 'b', 'c'], {}, { params: { rest: ['a', 'b', 'c'] }, rest: [] }],
    ['wildcard captures zero remaining', '*rest/', [], {}, { params: { rest: [] }, rest: [] }],
    ['wildcard after literal', 'files/*rest/', ['files', 'a', 'b'], {}, { params: { rest: ['a', 'b'] }, rest: [] }],
    ['literal then required param', 'users/:id/', ['users', '123', 'settings'], {}, { params: { id: '123' }, rest: ['settings'] }],
    ['accumulates inherited params', '#projectId/', ['42'], { orgId: 'acme' }, { params: { orgId: 'acme', projectId: 42 }, rest: [] }],
  ] satisfies [string, string, string[], Record<string, unknown>, MatchResult][])(
    '%s',
    (_, pattern, urlSegs, inherited, expected) => {
      expect(matchSegments(parseSegments(pattern), urlSegs, inherited)).toEqual(expected);
    },
  );

  it.each([['1.5'], ['1e3'], ['1.0']])(
    'rejects non-integer numeric string %s for num',
    (input) => {
      expect(matchSegments(parseSegments('#id/'), [input], {})).toBeNull();
    },
  );

  it.each([['1.5'], ['1e3'], ['1.0']])(
    'skips non-integer numeric string %s for opt-num',
    (input) => {
      expect(matchSegments(parseSegments('#id?/'), [input], {})).toEqual({
        params: {},
        rest: [input],
      });
    },
  );

  describe('optional segment ordering validation', () => {
    it.each([
      [':lang?/users', 'optional before required literal'],
      [':lang?/:page', 'optional before required param'],
      [':a?/:b?', 'optional before optional'],
      ['prefix/:opt?/suffix', 'optional in middle before literal'],
    ])('throws for illegal ordering: %s (%s)', (path) => {
      expect(() => parseSegments(path)).toThrow(
        /optional segment must be last.*Use nested routes/,
      );
    });

    it.each([
      ['users/:id?', 'optional is last'],
      [':id?/*rest', 'optional before wildcard only'],
      ['a/b/:id?', 'optional at end after literals'],
      [':id?', 'single optional'],
    ])('allows valid ordering: %s (%s)', (path) => {
      expect(() => parseSegments(path)).not.toThrow();
    });
  });
});
