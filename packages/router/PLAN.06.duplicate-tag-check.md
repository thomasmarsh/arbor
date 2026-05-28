# PLAN.06 — Add duplicate-tag detection

## Problem

If two routes share the same `tag` literal value:

- `walkPrint` finds whichever route appears first in the tree.
- `CtxMap` silently picks one of the context types.
- `HandlerMap` collapses both routes into one handler key.

There is no compile-time or runtime guard against this.

## Change — Runtime check

1. In `defineRoutes()` in `src/define-routes.ts`, after receiving `children`,
   walk the tree and collect all tags. If any tag appears more than once,
   throw an error at construction time:

   ```typescript
   function collectTags(nodes: WalkNode[]): string[] {
     const tags: string[] = [];
     for (const node of nodes) {
       if (node.schema !== null) {
         const tag = getTag(node.schema);
         if (tag) tags.push(tag);
       }
       if (node.children.length > 0) {
         tags.push(...collectTags(node.children as WalkNode[]));
       }
     }
     return tags;
   }
   ```

   Then in `defineRoutes`:

   ```typescript
   const tags = collectTags(nodes);
   const seen = new Set<string>();
   for (const tag of tags) {
     if (seen.has(tag)) throw new Error(`duplicate route tag: "${tag}"`);
     seen.add(tag);
   }
   ```

2. Add a test in `src/define-routes.test.ts` that asserts `defineRoutes`
   throws when given two routes with the same tag.

3. Run `npm test && npm run typecheck`.

## Optional — Compile-time check

A type-level duplicate check is possible but adds complexity. One approach
uses a recursive conditional type that accumulates seen tags and produces
`never` (or a branded error type) on collision. This could live in `CtxMap`
or a new `AssertUniqueTags` helper. Consider deferring this to a follow-up
unless the runtime check proves insufficient.

## Risk

Low. The runtime check runs once at construction time. The only concern is
whether any existing test intentionally uses duplicate tags (unlikely — grep
first).
