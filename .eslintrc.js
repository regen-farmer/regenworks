module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    'no-plusplus': ['off'],
    'max-len': ['off'],
    'prefer-destructuring': ['off'],
    'vars-on-top': ['off'],
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],
    'no-underscore-dangle': ['off'],
    'consistent-return': ['off'],
    'no-param-reassign': ['off'],
    'no-shadow': ['off'],
    'array-callback-return': ['off'],
    'no-inner-declarations': ['off'],
    'no-await-in-loop': ['off'],
    'func-names': ['error'],
    'no-console': ['off'],
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
    },
  },
};
