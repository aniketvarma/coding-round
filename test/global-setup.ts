import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  // The container has no TLS, and dbmate requires it unless told otherwise.
  const databaseUrl = `${container.getConnectionUri()}?sslmode=disable`;

  // Reuses db:migrate so its list of migration folders stays the only one.
  execFileSync('npm', ['run', 'db:migrate'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await container.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
