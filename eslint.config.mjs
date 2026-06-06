import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'ui-dist/', 'template/', 'node_modules/', 'DEV-DOCS/', 'test-artifacts/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Plain-JS Node helpers (the mock agent runs under the node binary, not the TS toolchain).
    files: ['tests/helpers/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      // the mock strips a UTF-8 BOM with a literal BOM char in a regex — intentional
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
);
