import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Flat config. Most of the repo's real rules are in AGENTS.md and cannot be
 * linted for - a machine cannot tell you whether a saving was rounded up. The
 * few that can be mechanised are here.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,

      // Law 5 has a corollary: a failure that nobody sees is a failure that gets
      // reported as a saving. An empty catch must say why it is empty.
      'no-empty': ['error', { allowEmptyCatch: false }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
    },
  },

  {
    // AGENTS.md: WASM is lazy-loaded on first use, never in the initial bundle.
    // scripts/check-budget.mjs catches this at build time; this catches it in
    // the editor, with a message that says why.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/workers/codecs.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@jsquash/*', 'thumbhash'],
              message:
                'Codecs are dynamically imported from src/workers/codecs.ts only. A static import puts the WASM in the initial bundle and breaks the 150 KB budget.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['tests/**/*.ts', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Fixture assertions index into known-shape arrays constantly.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
);
