import { z } from 'zod';
import { defineRoutes, httpRoute } from '@arbor/router';
import { HelloResponseSchema } from '@arbor/common';

const HelloHeaders = z.object({ 'x-arbor-sub': z.string().optional() });
const HelloRoute = z.object({ tag: z.literal('hello') });

export const helloRouter = defineRoutes([
  httpRoute(HelloRoute, 'GET', 'api/hello', {
    headers: HelloHeaders,
    response: { 200: HelloResponseSchema },
  }),
]);
