module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh', 'boundaries'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
    'boundaries/elements': [
      { type: 'app', pattern: 'src/app/**' },
      { type: 'feature', pattern: 'src/features/*/**', capture: ['feature'] },
      { type: 'domain', pattern: 'src/domain/**' },
      { type: 'entities', pattern: 'src/entities/**' },
      { type: 'lib', pattern: 'src/lib/**' },
      { type: 'state', pattern: 'src/state/**' },
      { type: 'styles', pattern: 'src/styles/**' },
    ],
  },
  rules: {
    'react-refresh/only-export-components': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'app', allow: ['feature', 'domain', 'entities', 'lib', 'state', 'styles'] },
          {
            from: 'feature',
            allow: [
              'domain',
              'entities',
              'lib',
              'state',
              'styles',
              ['feature', { feature: '${from.feature}' }],
            ],
          },
          { from: 'domain', allow: ['domain', 'entities'] },
          { from: 'entities', allow: ['entities'] },
          { from: 'lib', allow: ['lib', 'entities'] },
          { from: 'state', allow: ['state', 'entities'] },
          { from: 'styles', allow: [] },
        ],
      },
    ],
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.config.js', '*.config.ts'],
};
