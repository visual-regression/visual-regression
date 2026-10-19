import { typescript, javascript } from '@frsource/eslint-config';
import globals from 'globals';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...javascript,
  ...typescript,
  // apps/* have their own eslint config (Vue/Nuxt) and lint step
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/node_modules',
      '**/.nuxt',
      '**/.output',
      'apps/**',
    ],
  },
  { rules: { '@typescript-eslint/no-invalid-void-type': 'off' } },
  {
    files: ['packages/*/src/**', 'scripts/**'],
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
  },
  // the viewer is a command line tool: printing is its interface
  {
    files: ['packages/visual-regression-viewer/src/{cli,main}.ts'],
    rules: { 'no-console': 'off' },
  },
];
