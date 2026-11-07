import { existsSync } from 'node:fs';
import safeql from '@ts-safeql/eslint-plugin/config';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// ESLint doesn't read .env itself. CI passes DATABASE_URL as a real environment variable instead.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// ESLint runs only SafeQL; oxlint handles every other rule.
export default defineConfig([
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true },
    },
    extends: [
      safeql.configs.connections({
        databaseUrl: process.env.DATABASE_URL,
        targets: [{ tag: { regex: '^(this\\.)?sql$' }, transform: '{type}[]' }],
      }),
    ],
  },
]);
