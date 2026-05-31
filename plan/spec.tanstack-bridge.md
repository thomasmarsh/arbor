# TanStack Router Integration

> **Wrapping or plugging into TanStack Router** is the most practical way to bridge our type contract with an ecosystem that has already solved complex frontend lifecycles (loaders, caching, concurrent rendering, and history synchronization).

Because TanStack Router is designed around a code-based route tree builder rather than magic strings, we can map `RouteNode` topology directly into its architecture using an **additive extension**.

Here is how to design an additive extension that uses a **Top-Down Node Adapter** to transform a Nexus route configuration into a fully functional TanStack Router instance.

## The Strategy: Code-Generated Route Trees (Without Code-Gen Files)

TanStack Router builds its runtime and type mechanics by chaining a root route configuration down through child routes using `.addChildren([...])`.

We can write a generic adapter function---let's call it `createTanStackRouteTree`---that recursively crawls your Nexus route definitions, converts each `RouteNode` into a TanStack `Route` object, maps your Zod schema to TanStack's `validateSearch` or `parseParams`, and hooks your global state store/loaders directly into TanStack's lifecycle.

### Step 1: Extending the Context for TanStack Options

First, we allow your Nexus route factory definitions (`viewRoute`) to optionally accept TanStack-specific runtime life cycle configurations (like `loader`, `component`, or `pendingComponent`) inside the pluggable context slot.

```typescript
import { RouteOptions as TanStackRouteOptions } from '@tanstack/react-router';

// Extend your pluggable context to allow TanStack options seamlessly
export interface ViewRouteContext {
  component: React.ComponentType<any>;
  pendingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<any>;
  // The loader matches TanStack's signature but inherits your typed schema params!
  loader?: (ctx: { params: any; search: any }) => Promise<any>;
}
```

### Step 2: The TanStack Route Tree Adapter

This utility function recursively crawls your Nexus tree array, configures TanStack's internal route wrappers, maps parameter validation using your Zod definitions, and returns a unified tree array ready for the TanStack `createRouter` function.

```typescript
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';

export function adaptToTanStackTree(
  rootRoute: ReturnType<typeof createRootRoute>,
  nexusNodes: any[], // Your WalkNode array from defineRoutes
): any[] {
  return nexusNodes.map((node) => {
    // 1. Map paths: Transform Nexus syntax (e.g., 'users/' or ':id/') into TanStack syntax ('users' or '$id')
    const tanStackPath = node.path
      .replace(/\/$/, '') // Remove trailing slashes
      .replace(/:(\w+)/g, '$$$1') // Convert :id to $id
      .replace(/#(\w+)/g, '$$$1'); // Convert #projectId to $projectId

    // 2. Build the individual TanStack Route configuration
    const tsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: tanStackPath || '/',
      component: node.context?.component,
      pendingComponent: node.context?.pendingComponent,
      errorComponent: node.context?.errorComponent,

      // 3. Inject your existing Zod schema validation rules directly into TanStack
      parseParams: (rawParams) => {
        if (!node.schema) return rawParams;
        const parsed = node.schema.safeParse(rawParams);
        return parsed.success ? parsed.data : rawParams;
      },

      // Hook up loaders if declared in your Nexus context
      loader: node.context?.loader,
    });

    // 4. Recursively handle deeply nested children topologies
    if (node.children && node.children.length > 0) {
      const childrenTree = adaptToTanStackTree(tsRoute as any, node.children);
      return tsRoute.addChildren(childrenTree);
    }

    return tsRoute;
  });
}
```

### Step 3: Initializing the Combined Router Stack

Now, you can initialize the final runtime wrapper without duplicating your schemas. You get TanStack's rock-solid UI routing orchestration, powered exclusively by your Nexus single-source-of-truth definition file.

```typescript
import { createRootRoute, createRouter } from '@tanstack/react-router';
import { defineRoutes, viewRoute } from '@app/nexus';

// 1. Set up a standard TanStack Root Route Shell
const rootRoute = createRootRoute({
  component: AppRootLayoutShell,
});

// 2. Declare your Nexus Topology (Declaring schemas, layout parameters, and UI components in one place)
const nexusRouter = defineRoutes([
  viewRoute(UsersSchema, 'users/', {
    component: UsersDashboardComponent,
    children: [
      viewRoute(UserDetailSchema, ':id/', {
        component: UserProfileView,
        loader: async ({ params }) => fetchUserProfile(params.id), // <-- Strictly Typed!
      }),
    ],
  }),
]);

// 3. Adapt the Nexus Contract to TanStack at runtime
const routeTree = rootRoute.addChildren(adaptToTanStackTree(rootRoute, nexusRouter.children));

// 4. Create the final execution engine
export const router = createRouter({ routeTree });

// Register types for global TanStack Link autocomplete safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

## Why This Additive Approach Is Key

By wrapping TanStack this way, you gain full parity with everything they have spent years optimization-tuning, while retaining your core mathematical type definitions:

1. **State Store Synchronization**: TanStack triggers its loaders and concurrent data fetches under the hood. You can hook into TanStack's `onNavigate` or route action hooks to automatically push those parsed payloads directly into your Composable Architecture (TCA) global state store.
2. **Zero Maintenance Duplication**: Developers do not have to write standard TanStack route configuration trees or type assertions manually. They append a node to your `defineRoutes` map, append a UI component to the context slot, and the client application updates seamlessly.

3. **Keeps Server Contract Decoupled**: Your server runtime (`createServer`) still reads the exact same `nexusRouter` configuration completely unmodified. The server side remains fast and light, entirely oblivious to the fact that the frontend client is leveraging TanStack under the hood to manage UI render passes.
