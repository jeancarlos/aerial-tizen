// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const js = require('@eslint/js');

const browser = {
  window: 'readonly', document: 'readonly', console: 'readonly', localStorage: 'readonly',
  XMLHttpRequest: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', prompt: 'readonly', Image: 'readonly',
  navigator: 'readonly', location: 'readonly', tizen: 'readonly', webapis: 'readonly'
};

module.exports = [
  { ignores: ['coverage/**', 'node_modules/**', 'preload/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'demo/**/*.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: browser },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'off',
      'no-prototype-builtins': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['test/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setImmediate: 'readonly' } },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] }
  },
  {
    files: ['worker/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { fetch: 'readonly', Response: 'readonly', Request: 'readonly', URL: 'readonly', Headers: 'readonly', console: 'readonly', process: 'readonly' } }
  }
];
