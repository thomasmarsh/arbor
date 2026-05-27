# TypeScript Configuration

This project uses TypeScript project references for incremental builds and
cross-package type checking. Here's how the configs are structured and why.

---

## Root configs

**`tsconfig.base.json`** — shared compiler options inherited by all packages.
Contains strict settings (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
etc.) but no `module`, `target`, or `include` — those vary per package.

**`tsconfig.json`** — root-level config for files that live outside packages:
`vitest.workspace.ts` and `eslint.config.js`. Not used for building.

---

## Package configs

### `packages/common`, `packages/api`, `packages/bff`

These are Node packages. Each has a **single `tsconfig.json`** that covers
everything in `src/`, with `vitest.config.ts` excluded so it doesn't get
compiled into `dist/`.

`packages/common` is an exception — it needs **two files** because it is
referenced by other packages via TypeScript project references, and TypeScript
requires referenced projects to have `composite: true` with emit enabled. A
separate `tsconfig.build.json` carries those settings, while `tsconfig.json`
is a wrapper that points at it:

```text
packages/common/
  tsconfig.json        ← wrapper: { "files": [], "references": [./tsconfig.build.json] }
  tsconfig.build.json  ← composite: true, outDir: dist, noEmit: false
```

Other packages reference `../common/tsconfig.build.json` directly. The wrapper
`tsconfig.json` is what VS Code and ESLint's `projectService` point at.

> **Why not just use `tsconfig.json` for everything in common?**
> `tsc -b --noEmit` (used by typecheck scripts) propagates `--noEmit` to all
> referenced projects, overriding any `noEmit: false` in their config. This is
> a [known TypeScript issue](https://github.com/microsoft/TypeScript/issues/49571).
> The two-file split works around it.

### `packages/ui`

The UI package genuinely needs **three files** because `src/` and config files
require incompatible compiler settings:

| File                 | Covers                               | Module               | Why                               |
| -------------------- | ------------------------------------ | -------------------- | --------------------------------- |
| `tsconfig.app.json`  | `src/`                               | `ESNext` + `Bundler` | Vite bundler, DOM types, JSX      |
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts` | `NodeNext`           | Config files run in Node          |
| `tsconfig.json`      | —                                    | —                    | Wrapper referencing the two above |

The config files can't be included in `tsconfig.app.json` because they live
outside `src/` and would break the `rootDir` constraint. They can't share
`tsconfig.app.json`'s settings because they need `NodeNext` module resolution,
not `Bundler`.

---

## Summary

| Package  | Files | Reason                                                          |
| -------- | ----- | --------------------------------------------------------------- |
| `common` | 2     | Referenced by others — needs build config separate from wrapper |
| `api`    | 1     | Node only, not referenced by other packages                     |
| `bff`    | 1     | Node only, not referenced by other packages                     |
| `ui`     | 3     | `src/` and config files need different `module` settings        |

---

## typecheck vs build

`typecheck` scripts use `tsc --noEmit` (without `-b`) so they don't trigger
project reference builds. Turbo's `dependsOn: ["^build"]` ensures upstream
packages are already built before typecheck runs.

`build` scripts use `tsc -b` which respects project references and produces
incremental output in `dist/`.
