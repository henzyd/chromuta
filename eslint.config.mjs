import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', 'examples/**', '*.vsix']
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Type-aware linting covers the source trees. The root config files are not part
    // of tsconfig, so pointing the typed parser at them only produces parse errors.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          // Destructuring a field out in order to drop it is intentional.
          ignoreRestSiblings: true
        }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  {
    // src/core must stay free of the editor API. See ARCHITECTURE.md section 1.
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vscode',
              message:
                'src/core must not import the editor API. Keep editor-aware code in ' +
                'src/workspace or src/features so the engine stays unit-testable.'
            }
          ]
        }
      ]
    }
  },

  {
    files: ['test/**/*.ts'],
    rules: {
      // Tests build partial stand-ins for editor objects on purpose.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off'
    }
  },

  {
    // Repository scripts are Node programs, not part of the extension bundle.
    files: ['.github/scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' }
    },
    rules: { 'no-console': 'off' }
  },

  {
    // The build script is a plain CommonJS Node program, not part of the extension.
    files: ['esbuild.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'readonly', process: 'readonly', console: 'readonly' }
    },
    rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' }
  },

  // Must stay last so it can switch off anything that fights the formatter.
  prettier
);
