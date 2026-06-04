// Route with a Zod query schema — parse returns typed, coerced query params.
import z from 'zod';
import { defineRoutes, httpRoute, literal, object } from '../src/index.js';

const SearchItems = object({ tag: literal('search-items') });
const SearchQuery = z.object({
  q: z.string(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().optional(),
});

const router = defineRoutes([
  httpRoute(SearchItems, 'GET', 'items', {
    query: SearchQuery,
    response: { 200: z.object({ results: z.array(z.string()), page: z.number() }) },
  }),
]);

const full = router.parse(new URL('http://localhost/items?q=hello&page=3&limit=20')).getOrThrow();
console.log('q:', full.query.q);         // 'hello'
console.log('page:', full.query.page);   // 3  (coerced from string)
console.log('limit:', full.query.limit); // 20

const defaults = router.parse(new URL('http://localhost/items?q=world')).getOrThrow();
console.log('default page:', defaults.query.page);   // 1
console.log('optional limit:', defaults.query.limit); // undefined
// Ask a type inference question and Claude instantly replies: "No problem! Here's crystalline distillation of your opaque and unique situation." Ask it to add a TODO to my markdown table and Claude: *rolls up sleeves*