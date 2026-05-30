/**
 * A single segment of a URL path.
 * - `lit` — a literal string segment e.g. `users`
 * - `str` — a named string parameter e.g. `:id`
 * - `num` — a named numeric parameter e.g. `#id`
 * - `opt-str` — an optional string parameter e.g. `:id?`
 * - `opt-num` — an optional numeric parameter e.g. `#id?`
 * - `wildcard` — captures all remaining segments e.g. `*rest`
 */
export type Segment =
  | { kind: 'lit'; value: string }
  | { kind: 'str'; name: string }
  | { kind: 'num'; name: string }
  | { kind: 'opt-str'; name: string }
  | { kind: 'opt-num'; name: string }
  | { kind: 'wildcard'; name: string };

export function parseSegments(path: string): Segment[] {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s): Segment => {
      if (s.startsWith('*')) return { kind: 'wildcard', name: s.slice(1) };
      if (s.startsWith('#') && s.endsWith('?')) return { kind: 'opt-num', name: s.slice(1, -1) };
      if (s.startsWith(':') && s.endsWith('?')) return { kind: 'opt-str', name: s.slice(1, -1) };
      if (s.startsWith('#')) return { kind: 'num', name: s.slice(1) };
      if (s.startsWith(':')) return { kind: 'str', name: s.slice(1) };
      return { kind: 'lit', value: s };
    });
  validateOptionalOrdering(segments, path);
  return segments;
}

function validateOptionalOrdering(segments: Segment[], path: string): void {
  let sawOptional = false;
  for (const seg of segments) {
    const isOptional = seg.kind === 'opt-str' || seg.kind === 'opt-num';
    const isWildcard = seg.kind === 'wildcard';
    if (sawOptional && !isWildcard) {
      throw new Error(
        `Invalid path "${path}": optional segment must be last (only a wildcard may follow). ` +
        `Use nested routes to model optional prefixes.`,
      );
    }
    if (isOptional) sawOptional = true;
  }
}

export function matchSegments(
  astSegments: Segment[],
  urlSegments: string[],
  params: Record<string, unknown>,
): { params: Record<string, unknown>; rest: string[] } | null {
  const next = { ...params };
  let urlIndex = 0;

  for (const seg of astSegments) {
    const url = urlSegments[urlIndex];

    switch (seg.kind) {
      case 'lit':
        if (url !== seg.value) return null;
        urlIndex++;
        break;

      case 'str':
        if (url == null) return null;
        next[seg.name] = url;
        urlIndex++;
        break;

      case 'num': {
        if (url == null) return null;
        const n = parseInt(url, 10);
        if (isNaN(n) || String(n) !== url) return null;
        next[seg.name] = n;
        urlIndex++;
        break;
      }

      case 'opt-str':
        if (url != null) {
          next[seg.name] = url;
          urlIndex++;
        }
        break;

      case 'opt-num': {
        if (url != null) {
          const n = parseInt(url, 10);
          if (!isNaN(n) && String(n) === url) {
            next[seg.name] = n;
            urlIndex++;
          }
        }
        break;
      }

      case 'wildcard':
        next[seg.name] = urlSegments.slice(urlIndex);
        urlIndex = urlSegments.length;
        break;
    }
  }

  return {
    params: next,
    rest: urlSegments.slice(urlIndex),
  };
}
