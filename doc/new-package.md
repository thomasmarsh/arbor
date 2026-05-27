# Adding a New Package

Follow these steps when adding a new package to the monorepo.
Replace `<name>` with the package name (e.g. `router`) and `@arbor/<name>` with the full package name.

---

## 1. Create the directory structure

```bash
mkdir -p packages/<name>/src
```

---

## 2. `packages/<name>/package.json`

```json
{
  "name": "@arbor/<name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types":  "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build":      "tsc -b",
    "dev":        "tsc -b --watch",
    "typecheck":  "tsc --noEmit",
    "lint":       "eslint src",
    "test":       "vitest run",
    "test:watch": "vitest",
    "clean":      "rm -rf dist *.tsbuildinfo"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript":  "^5.5.0",
    "vitest":      "^4.1.7"
  }
}
```

Add any runtime dependencies to `dependencies` as needed.

---

## 3. `packages/<name>/tsconfig.json`

For packages that are **not** referenced by other packages (most packages):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite":       true,
    "module":          "NodeNext",
    "moduleResolution":"NodeNext",
    "target":          "ES2022",
    "outDir":          "dist",
    "rootDir":         "src",
    "tsBuildInfoFile": "tsconfig.tsbuildinfo"
  },
  "include": ["src"],
  "exclude": ["vitest.config.ts"]
}
```

For packages that **are referenced by other packages** (like `common`), you need
two files — see `packages/common/tsconfig.json` and `tsconfig.build.json` as a
reference, and read `README.tsconfig.md` for the full explanation.

---

## 4. `packages/<name>/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    root:        __dirname,
    environment: 'node',
    include:     ['src/**/*.test.ts'],
  },
});
```

If the package needs environment variables (e.g. a database URL), add a
`setupFiles` entry — see `packages/api/vitest.config.ts` for an example.

> The vitest workspace uses a glob (`packages/*/vitest.config.ts`) so new
> packages are picked up automatically. No changes to `vitest.workspace.ts`
> needed.

---

## 5. `packages/<name>/src/index.ts`

```typescript
// @arbor/<name>
export { } from './<your-module>.js';
```

---

## 6. Add as a dependency in consumer packages

In any package that needs to import from `@arbor/<name>`, add to its
`package.json`:

```json
"dependencies": {
  "@arbor/<name>": "workspace:*"
}
```

And add a project reference in its `tsconfig.json`:

```json
{
  "references": [
    { "path": "../<name>/tsconfig.json" }
  ]
}
```

---

## 7. Install

```bash
pnpm install
```

---

## Checklist

- [ ] `packages/<name>/package.json`
- [ ] `packages/<name>/tsconfig.json`
- [ ] `packages/<name>/vitest.config.ts`
- [ ] `packages/<name>/src/index.ts`
- [ ] Consumer `package.json` updated
- [ ] Consumer `tsconfig.json` references updated
- [ ] `pnpm install` run