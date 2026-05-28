# PLAN.07 — Replace hand-rolled `zodToJsonSchema` with Zod v4 built-in

## Problem

`src/openapi-context.ts` has a hand-rolled `zodToJsonSchema()` function
(lines 66-100) that manually handles ~8 Zod types: string, number, boolean,
literal, enum, optional, default, object. It silently returns `{}` for
everything else — arrays, unions, intersections, nullable, records, tuples,
transforms, pipes, branded types, dates, etc.

This produces invalid OpenAPI specs for any non-trivial schema with no
warning.

## Change

Zod v4 ships `toJSONSchema()` in `zod/v4/mini` (or via the standard import
depending on the Zod v4 build). Check what's available:

```bash
node -e "const z = require('zod'); console.log(typeof z.toJSONSchema)"
```

1. If `toJSONSchema` is available from the project's Zod version, replace
   the hand-rolled function with it.

2. If not directly available, check for `zod-to-json-schema` or
   `@sodaru/zod-to-json-schema` as a lightweight dependency.

3. Remove the local `zodToJsonSchema` function and all its per-type branches.

4. Update `walkSpec()` to call the replacement wherever it currently calls
   `zodToJsonSchema`.

5. Update tests in `src/openapi-context.test.ts` — the schema output shape
   may differ slightly (e.g. the built-in might add `$schema`, `description`,
   or handle `required` differently). Adjust assertions to match.

6. Add a test with a Zod schema that uses `z.array()` and `z.union()` to
   confirm the replacement handles types the old function didn't.

7. Run `npm test && npm run typecheck`.

## Risk

Medium. The replacement function may produce subtly different JSON Schema
output (different key ordering, extra fields, different handling of
`z.coerce` or `z.default`). Diff the before/after spec output for the
existing test router to catch regressions.
