// @ts-check
import { defineConfig } from 'eslint/config';
import { configs } from 'typescript-eslint';

export default defineConfig({
  files: ['**/*.ts', '**/*.tsx'],
  extends: [...configs.strictTypeChecked, ...configs.stylisticTypeChecked],
  ignores: ['** /dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  languageOptions: {
    parserOptions: {
      // Automatically discovers tsconfig.json files — no need to list them manually.
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
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
  },
});
