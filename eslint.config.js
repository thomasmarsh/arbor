// @ts-check
import { defineConfig } from 'eslint/config';
import { configs } from 'typescript-eslint';

export default defineConfig([
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  {
    extends: [...configs.strictTypeChecked, ...configs.stylisticTypeChecked],
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    ignores: ['**/generated/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    files: ['packages/router/src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['packages/**/*.test.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/**/examples/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]);
