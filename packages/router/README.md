# Nexus

> **A Pluggable Type-Topology & Unified Data Contract for Modern Applications.**

Nexus is more than a router. It is a single source of truth that maps nested application structures, data validation barriers, runtime schemas, and pluggable network protocols into a single, cohesive type tree.

With Nexus, you declare your application's domain topology once. The type engine then automatically drives your front-end user interface layouts, backend RPC/REST servers, event-driven message queues, microservices, and end-to-end testing rigs with total compile-time safety.

## Core Concepts

- **Single Source of Truth:** One definition file generates types for front-end clients, backend services, and multi-protocol gateways.

- **Nested State Topology:** Routes are modeled as highly expressive, nested state objects (`{ tag: 'parent', child: { tag: 'child' } }`), cleanly mapping directly to recursive view hierarchies and composable global stores (TCA / Redux).

- **Pluggable Context Engine:** Parametric type parameters let you reuse the same structure for HTTP APIs (`httpRoute`), Event Brokers (`eventRoute`), WebSockets (`socketRoute`), or Client View Layouts (`viewRoute`).

## Quick Start

### 1. Define Your Contracts & Topology

Declare your system primitives using Zod schemas and compile your domain topology. Notice how children routes nest recursively right inside the parent nodes:

```typescript
import { z } from 'zod';
import { defineTopology, httpRoute } from '@app/nexus';

// Define Data Primitives
const UserSchema = z.object({ tag: z.literal('user'), id: z.string() });
const SettingsSchema = z.object({ tag: z.literal('settings') });
const UserResp = z.object({ id: z.string(), email: z.string() });

// Compose the Topology Contract
export const appTopology = defineTopology([
  httpRoute(UserSchema, 'GET', 'users/:id/', {
    response: { 200: UserResp },
    children: [httpRoute(SettingsSchema, 'GET', 'settings/')],
  }),
]);
```

### 2. Frontend Layout & State Synchronization

Because Nexus outputs raw, deeply-nested discriminated object unions instead of flat string tokens, you can drive component layout selection natively.

If you use a composable global store (like TCA), simply pipe the parsed route payload straight into your application state:

```tsx
import { type Derive } from '@app/nexus';
import { appTopology } from './topology';

// Extracted absolute layout type union
type AppRouteState = Derive<typeof appTopology>;

function AppRouterView({ route }: { route: AppRouteState | undefined }) {
  if (!route) return <NotFoundScreen />;

  // TypeScript flawlessly narrows down properties inside each branch!
  switch (route.tag) {
    case 'user':
      return (
        <UserLayoutProfile userId={route.id}>
          {/* Recursively pass down the nested layout child */}
          <AppRouterView route={route.child} />
        </UserLayoutProfile>
      );

    case 'settings':
      return <UserSettingsForm />;

    default:
      return <DashboardHome />;
  }
}
```

### 3. Consume via Type-Safe Clients

Nexus maps the backend handler requirements back into your frontend fetch signatures, providing native IDE autocomplete for payload shapes and HTTP status responses:

```typescript
import { createClient } from '@app/nexus';
import { appTopology } from './topology';

const client = createClient('https://example.com', appTopology);

async function run() {
  // Safe payload passing verified at compile time
  const result = await client.fetch({ tag: 'user', id: '123' });

  // The type of `result` is explicitly locked to:
  // { status: 200; body: { id: string; email: string } }
  if (result.status === 200) {
    console.log(result.body.email);
  }
}
```

## Under the Hood: Deep Type Mechanics

Traditional TypeScript conditional evaluations distribute naked generics when they encounter an empty type set (`never`). Nexus implements strict type isolation using wrapped tuple matching constraints:

```typescript
export type Derive<N> =
  N extends RouteNode<infer R, infer Child, any, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }>
      : [Child] extends [never]
        ? Flatten<R>
        : Flatten<R & { child?: Child }>
    : never;
```

By constraining target assertions using `[R] extends [never]`, Nexus short-circuits distribution bugs, guaranteeing that cleanly flattened, accurate interfaces are returned regardless of path hierarchy completeness.

## Future Roadmap

- **Query Parameter Parsing:** Seamless structural parsing and runtime type coercion for complex URL query configurations.

- **Event Broker Protocols:** Pluggable topology support for event topologies over Kafka, RabbitMQ (`amqp://`), and WebSockets (`ws://`).

- **OpenAPI Generator Hook:** Automatic one-click generation of fully verified `openapi.json` contract compliance sheets.
