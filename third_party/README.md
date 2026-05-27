# third_party

Forked or locally-patched dependencies live here as workspace packages.

## Adding a fork

1. Copy the upstream package source into a subdirectory:

   ```text
   packages/third_party/some-lib/
   ├── package.json   ← keep the original "name" field
   └── src/
   ```

2. Declare it as a workspace dependency in any package that needs it:

   ```json
   // packages/api/package.json
   { "dependencies": { "some-lib": "workspace:*" } }
   ```

3. pnpm will symlink it automatically on `pnpm install`.

## Pinning without modification (pnpm overrides)

If you only need to pin a specific version without modifying source, prefer
`pnpm.overrides` in the root `package.json` instead:

```json
{
  "pnpm": {
    "overrides": {
      "some-lib": "1.2.3"
    }
  }
}
```
