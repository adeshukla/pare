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
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      // Fixtures are test data. They are deliberately unminified and deliberately
      // written the way a real site would be; linting them would invite edits
      // that change what the minifier tests are actually testing.
      'tests/fixtures/**',
    ],
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
    ignores: ['src/workers/codecs.ts', 'src/workers/font-codecs.ts', 'src/workers/text-codecs.ts'],
    rules: {
      // The TypeScript-aware version, because `import type` is erased and so
      // costs nothing - only a value import can reach the bundle.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@jsquash/*',
                'thumbhash',
                'brotli-wasm',
                'esbuild-wasm',
                'esbuild-wasm/*',
                'harfbuzzjs',
                'harfbuzzjs/*',
                'html-minifier-terser',
                'lightningcss-wasm',
                'svgo',
                'svgo/*',
                'woff2-encoder',
                'woff2-encoder/*',
              ],
              allowTypeImports: true,
              message:
                'Codecs are dynamically imported from src/workers/*-codecs.ts only. A static import puts the library, and its WASM, in the initial bundle and breaks the 150 KB budget.',
            },
          ],
        },
      ],

      // clean-css and terser get a `process` shim from vite.config.ts. Pare's
      // own code has no business reaching for Node globals.
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'There is no Node runtime here. Pare is a browser app.' },
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
