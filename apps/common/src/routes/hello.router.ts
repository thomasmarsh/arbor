import { z } from 'zod';
import { defineRoutes, httpRoute, literal, object } from '@arbor/router';
import { HelloResponseSchema } from '../schemas/hello.js';

const HelloHeaders = z.object({ 'x-arbor-sub': z.string().optional() });
const HelloRoute = object({ tag: literal('hello') });

export const helloRouter = defineRoutes([
  httpRoute(HelloRoute, 'GET', 'api/hello', {
    headers: HelloHeaders,
    response: { 200: HelloResponseSchema },
  }),
]);
