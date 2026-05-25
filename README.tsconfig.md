# A Note on `.tsconfig.*` Files

You'll notice a pattern of annoying boilerplate files:

- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`

The split exists because TypeScript needs different compiler settings for different file types in the same package:

`tsconfig.app.json` - source files (`src/`):

- `composite: true` - enables incremental builds and - project references
- `outDir: dist` - emits compiled output
- `rootDir: src` - constrains what gets compiled

`tsconfig.node.json` - config files (`vitest.config.ts`, `vite.config.ts`):

- `noEmit: true` - these files don't need compiled output
- `module: NodeNext` - these run in Node, not the browser
  Can't be in tsconfig.app.json because config files are outside src/

`tsconfig.json` - solution file:

- Just lists the two references above
- This is what VS Code, `tsc -b`, and ESLint's `projectService` all point at
  Lets the language server understand the full package without picking one config

Without the split, you get one of two problems:

- Put config files in `tsconfig.app.json` → they get compiled into `dist/` and the `rootDir` constraint breaks
- Leave config files out → ESLint and VS Code can't find their types, giving "not found by project service" errors

The alternative is a single tsconfig.json with allowDefaultProject in ESLint config, but that has its own set of issues.
    