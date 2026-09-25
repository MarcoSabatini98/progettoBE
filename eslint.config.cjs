const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    ignores: ['node_modules/', 'coverage/', 'logs/', 'uploads/'],
  },

  // Regole generali (backend Node.js)
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'warn',
      'no-async-promise-executor': 'error',
      'require-await': 'error',
      eqeqeq: ['error', 'smart'],
      curly: 'error',
      'no-eval': 'error',
      'no-useless-catch': 'warn',
      'no-shadow': 'warn',
      'no-use-before-define': ['error', { functions: false }],
      'no-redeclare': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'consistent-return': 'warn',
    },
  },

  // Test Jest
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },

  // Deve restare ultimo: spegne le regole che confliggono con Prettier.
  prettierConfig,
];
