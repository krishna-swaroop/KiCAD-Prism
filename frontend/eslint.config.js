import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public/three', 'public/3d-viewer.js', 'public/ecad-viewer.js', 'public/glyph-full.js']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...(reactHooks.configs.recommended?.rules ?? {}),
      ...(reactRefresh.configs.vite?.rules ?? {}),
      '@typescript-eslint/no-explicit-any': 'off',
      // Honour the `_`-prefix convention the codebase already uses to mark a
      // binding as intentionally unused (e.g. placeholder `_props`, `_boxHalfExtent`).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'react-refresh/only-export-components': 'off',
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
