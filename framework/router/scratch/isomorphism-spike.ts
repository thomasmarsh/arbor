/**
 * Plan 127 — Spike: Route/OpenAPI structural isomorphism
 *
 * Representative route: GET /users/:id → { 200: UserSchema, 404: NotFound }
 *
 * FINDINGS (run with: pnpm --filter @arbor/router exec tsx scratch/isomorphism-spike.ts)
 *
 * DIVERGENCE TABLE (Zod v4 with z.toJSONSchema()):
 *
 * | Component                | Lossless? | Notes                                                     |
 * |--------------------------|-----------|-----------------------------------------------------------|
 * | Path params (:id / #id)  | YES       | str→string, num→integer, required correct                 |
 * | .email() format          | YES+      | format:"email" preserved; extra pattern regex added       |
 * | .int().nonnegative()     | YES+      | type:integer, minimum:0 preserved; extra maximum:MAX_SAFE |
 * | z.enum()                 | YES       | enum array preserved exactly                              |
 * | z.optional()             | YES       | omitted from required[] correctly                        |
 * | z.nullable()             | YES       | anyOf:[{type:string},{type:null}] — valid OAS 3.1         |
 * | discriminatedUnion       | PARTIAL   | oneOf members correct, but no discriminator property      |
 * | .refine()                | NO        | refinement predicate is SILENTLY DROPPED                  |
 * | operationId/summary/tags | YES       | preserved via meta option                                 |
 * | response status codes    | YES       | per-status response objects exact                         |
 *
 * DECISION MEMO (≤350 words)
 *
 * Which option (A/B/C)?
 * → Option C. Zod v4's built-in toJSONSchema() already closes nearly all the gaps
 *   that existed with Zod v3's external zod-to-json-schema library. format, integer
 *   constraints, enum, required/optional, and nullable all survive the round-trip.
 *   Option A (spec-first) inverts the entire authoring model and requires codegen —
 *   not worth it. Option B (type-level round-trip test via SpecDerivation<R>) would
 *   prove nothing for refinements because .refine() is invisible at the TypeScript
 *   type level; it would only duplicate what z.toJSONSchema() already does structurally.
 *
 * Is full Servant-style isomorphism feasible in TypeScript without codegen?
 * → No, for one fundamental reason: .refine() predicates exist only at runtime.
 *   They have no TypeScript type-level representation (z.refine returns the same
 *   inferred type as the base schema). A compile-time guarantee cannot be stronger
 *   than the type system's expressivity. The best achievable guarantee is: if the
 *   Zod schema changes its *structure* (new field, changed type, new enum variant),
 *   the JSON Schema output changes too — because both derive from the same Zod object.
 *   This structural isomorphism already holds via z.toJSONSchema().
 *   Servant's guarantee is achievable for structure; not for value-level predicates.
 *
 * Recommended follow-on plan (if "proceed"):
 * 1. Add `discriminator` property in generateSpec.ts: detect ZodDiscriminatedUnion
 *    (z.ZodDiscriminatedUnion in Zod v4) and emit OpenAPI `discriminator.propertyName`.
 *    This is a ~10-line change in buildResponses/zodToJsonSchema.
 * 2. Document the .refine() gap: add a note to generateSpec.ts and the OpenAPI
 *    section of the README that refinements are not representable in JSON Schema;
 *    users who need them should use x-* extensions via the meta option.
 * 3. (Optional) Strip the extra `maximum: 9007199254740991` noise from
 *    .nonnegative() output — it's technically correct but confuses human readers.
 *    Could be done with a post-processing pass or a zodToJsonSchema wrapper.
 *
 * No changes to src/ in this spike.
 */

import z from 'zod';
import { defineRoutes, generateSpec } from '../src/index.js';
import { openApiRoute } from '../src/contexts/openapi/openapi-context.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  age: z.number().int().nonnegative(),
  role: z.enum(['admin', 'user']),
  nickname: z.string().optional(),
});

const NotFound = z.object({ error: z.string() });

const DiscriminatedBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('a'), value: z.string() }),
  z.object({ kind: z.literal('b'), count: z.number() }),
]);

const WithNullable = z.object({ id: z.string(), deletedAt: z.string().nullable() });

const WithRefinement = z
  .object({ password: z.string() })
  .refine((v) => v.password.length >= 8, { message: 'too short' });

const router = defineRoutes([
  openApiRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserSchema, 404: NotFound },
    meta: { summary: 'Get user by ID', operationId: 'getUser', tags: ['users'] },
  }),
]);

const actual = generateSpec(router, { title: 'Test API', version: '1.0.0' });
console.log('=== GENERATED SPEC ===');
console.log(JSON.stringify(actual, null, 2));

console.log('\n=== DIVERGENCE PROBES ===');

console.log('\n[1] z.string().email() — does format="email" survive?');
console.log(JSON.stringify(z.toJSONSchema(z.string().email())));

console.log('\n[2] z.number().int().nonnegative() — integer + minimum?');
console.log(JSON.stringify(z.toJSONSchema(z.number().int().nonnegative())));

console.log('\n[3] z.discriminatedUnion() — oneOf with discriminator property?');
console.log(JSON.stringify(z.toJSONSchema(DiscriminatedBody)));

console.log('\n[4] z.string().nullable() — anyOf or null union?');
const nullableJson = z.toJSONSchema(WithNullable) as { properties: Record<string, unknown> };
console.log(JSON.stringify(nullableJson.properties['deletedAt']));

console.log('\n[5] .refine() — predicate preserved?');
console.log(JSON.stringify(z.toJSONSchema(WithRefinement)));
console.log('^ refinement dropped: only base object shape survives — BREAKING GAP');
