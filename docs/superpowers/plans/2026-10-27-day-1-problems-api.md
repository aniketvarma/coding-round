# Day 1: Problems API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `GET /problems/:slug` from Postgres on a tested, linted, containerized NestJS 12 foundation.

**Architecture:** A modular monolith. `src/platform/` holds shared infrastructure (config, database, errors, health); `src/modules/problems/` holds the feature (tables, Zod schemas, repository, service, controller) behind an `index.ts` public API. One Zod schema per shape validates requests, allow-lists responses, and generates OpenAPI. E2E tests boot the real app against a throwaway Postgres.

**Tech Stack:** NestJS 12 (ESM), TypeScript 6, Drizzle ORM `1.0.0-rc.5` with node-postgres, Zod 4, `@nestjs/drizzle`, `@nestjs/config`, `@nestjs/swagger`, `@nestjs/terminus`, Vitest 4, Testcontainers, oxlint, dependency-cruiser, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-27-day-1-problems-api-design.md`

## Global Constraints

- Node 26 (`.nvmrc` holds `26`). TypeScript stays on 6.x, because dependency-cruiser requires a version below 7.
- ESM: every relative import ends in `.js`, even though the file is `.ts`.
- `drizzle-orm` and `drizzle-kit` are pinned to exactly `1.0.0-rc.5` (`--save-exact`). `@nestjs/drizzle` is `0.0.2`.
- Postgres image `postgres:18-alpine` in Compose, tests, and CI.
- Never run `drizzle-kit push`. Migrations come from `drizzle-kit generate` and are committed.
- Slug rule: `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 100 characters.
- Success bodies are `{ data, meta? }`. Error bodies are RFC 9457 Problem Details with `Content-Type: application/problem+json` and `type: "about:blank"`. A 5xx `detail` is always `An unexpected error occurred.`
- API reads never select `reference_solution`.
- Code outside a module imports it only through its `index.ts`. `src/platform/` never imports `src/modules/`. No import cycles.
- Log with Nest's `Logger`. `console` is a lint error from Task 10 on.

## How to use this plan

Every task follows the same loop: write the test, run it and watch it fail, write the code, run it and watch it pass, commit. The code blocks are complete. If you want to learn by doing, write each piece yourself first and use the block as the answer key.

When you ask questions in a new session, reference this file and the task number, for example: "I'm on Task 5, step 4 of `docs/superpowers/plans/2026-10-27-day-1-problems-api.md`."

## File map

| File | Responsibility | Task |
|---|---|---|
| `.nvmrc` | pins Node 26 | 1 |
| `src/app.module.ts` | root module: config, database, health, problems, global pipe/filter/serializer | 1–7 |
| `src/main.ts` | bootstrap: setup, shutdown hooks, listen on `PORT` | 2, 8 |
| `src/app.setup.ts` | helmet, CORS, Swagger; shared by `main.ts` and e2e tests | 8 |
| `src/platform/config/env.schema.ts` | Zod schema for env vars | 2 |
| `.env.example` | documents every env var | 2 |
| `src/platform/errors/request-validation.ts` | validation pipe and its 400 exception | 3 |
| `src/platform/errors/problem-details.ts` | pure mapping from any exception to Problem Details | 3 |
| `src/platform/errors/problem-details.filter.ts` | global filter that writes Problem Details | 3 |
| `docker-compose.yml` | local Postgres; later the app image | 4, 11 |
| `drizzle.config.ts` | drizzle-kit settings | 4 |
| `src/modules/problems/problems.tables.ts` | `problems` and `problem_languages` tables | 4 |
| `drizzle/` | generated SQL migrations | 4 |
| `src/platform/database/database.ts` | the `Database` type | 5 |
| `src/platform/database/database.module.ts` | registers Drizzle with the connection from config | 5 |
| `src/platform/health/*` | `GET /health` with a database check | 5 |
| `test/setup/*`, `test/support/test-app.ts` | e2e harness: Postgres container, env, app factory | 5, 8 |
| `src/modules/problems/problems.dto.ts` | slug and response schemas | 6 |
| `src/modules/problems/problems.{repository,service,controller,module}.ts`, `index.ts` | the endpoint | 7 |
| `test/support/database.ts` | table reset and fixtures | 7 |
| `src/modules/problems/problems.seed.ts` | development seed | 9 |
| `.dependency-cruiser.cjs`, `test/architecture/*` | boundary rules and their test | 10 |
| `Dockerfile`, `.dockerignore` | production image | 11 |
| `.github/workflows/ci.yml` | CI | 12 |
| `README.md`, `docs/decisions/*` | docs | 13 |

---

### Task 1: Baseline commit and scaffold cleanup

**Files:**
- Delete: `test/app.e2e-spec.ts` (the `src/cat` sample is already gone, and `src/app.module.ts` already declares an empty module)
- Modify: `package.json`
- Create: `.nvmrc`

**Interfaces:**
- Consumes: nothing.
- Produces: the empty `AppModule` in `src/app.module.ts`, the `typecheck` npm script, and the `day-1` branch.

- [ ] **Step 1: Commit the current scaffold and the design docs as a baseline, then branch**

```bash
git add -A
git commit -m "chore: NestJS 12 scaffold and day 1 design docs"
git switch -c day-1
```

Expected: one commit on `main`, and you are now on `day-1`.

- [ ] **Step 2: Delete the stale e2e test**, which still expects the removed `GET /` "Hello World!" route

```bash
git rm test/app.e2e-spec.ts
```

- [ ] **Step 3: Check that `src/app.module.ts` declares an empty module**, with no controllers or providers left over from the sample. Task 2 replaces it anyway.

- [ ] **Step 4: Remove the Mau deploy tooling, pin Node, and add a typecheck script**

```bash
npm uninstall @nestjs/mau
npm pkg delete scripts.deploy
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set engines.node=">=26"
echo 26 > .nvmrc
```

- [ ] **Step 5: Verify the project still builds, lints and typechecks**

Run: `npm run build && npm run lint && npm run typecheck`
Expected: all three exit with code 0. (`npm test` reports "No test files found" until Task 2.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove scaffold samples and pin Node 26"
```

---

### Task 2: Validated configuration (spec test 6)

**Files:**
- Create: `src/platform/config/env.schema.ts`, `src/platform/config/env.schema.spec.ts`, `.env.example`
- Modify: `src/app.module.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `AppModule` from Task 1.
- Produces: `envSchema` (Zod object) and `type Env = { NODE_ENV: 'development' | 'test' | 'production'; PORT: number; DATABASE_URL: string; CORS_ORIGINS: string[] }` from `src/platform/config/env.schema.ts`. `ConfigService<Env, true>` is available everywhere because `ConfigModule` is global.

- [ ] **Step 1: Install the config packages**

```bash
npm install @nestjs/config zod
```

- [ ] **Step 2: Write the failing test** in `src/platform/config/env.schema.spec.ts`

```ts
import { envSchema } from './env.schema.js';

const validEnv = { DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/mock_interview' };

function failingPaths(input: Record<string, string>): string[] {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('envSchema', () => {
  describe('rejects', () => {
    it('a missing DATABASE_URL', () => {
      expect(failingPaths({})).toContain('DATABASE_URL');
    });

    it('a DATABASE_URL that is not a Postgres URL', () => {
      expect(failingPaths({ DATABASE_URL: 'mysql://root@localhost:3306/app' })).toContain('DATABASE_URL');
    });

    it('a PORT outside 1-65535', () => {
      expect(failingPaths({ ...validEnv, PORT: '70000' })).toContain('PORT');
    });
  });

  describe('accepts', () => {
    it('a minimal environment and fills in the defaults', () => {
      expect(envSchema.parse(validEnv)).toEqual({
        NODE_ENV: 'development',
        PORT: 3000,
        DATABASE_URL: validEnv.DATABASE_URL,
        CORS_ORIGINS: ['http://localhost:5173'],
      });
    });

    it('a postgresql:// URL, a numeric PORT string and several CORS origins', () => {
      const env = envSchema.parse({
        DATABASE_URL: 'postgresql://app:secret@db:5432/app',
        PORT: '8080',
        CORS_ORIGINS: 'http://localhost:5173, https://app.example.com',
      });

      expect(env.PORT).toBe(8080);
      expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://app.example.com']);
    });
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npx vitest run src/platform/config`
Expected: FAIL, because `./env.schema.js` cannot be resolved yet.

- [ ] **Step 4: Write the schema** in `src/platform/config/env.schema.ts`

```ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'Must be a postgres:// or postgresql:// URL.' }),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export type Env = z.infer<typeof envSchema>;
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/platform/config`
Expected: PASS, 5 tests.

- [ ] **Step 6: Load and validate the config at startup.** Replace `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './platform/config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests get their settings from the test setup, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validationSchema: envSchema,
    }),
  ],
})
export class AppModule {}
```

Replace `src/main.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './platform/config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config: ConfigService<Env, true> = app.get(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
```

- [ ] **Step 7: Document the variables** in `.env.example`, then create your local `.env` from it

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mock_interview
CORS_ORIGINS=http://localhost:5173
```

```bash
cp .env.example .env
```

- [ ] **Step 8: Watch the app refuse a bad config, then start with a good one**

Run: `DATABASE_URL=mysql://root@localhost/app npm run start`
Expected: the app stops during startup with `Error: Config validation error: DATABASE_URL: Must be a postgres:// or postgresql:// URL.` A variable set in the shell wins over `.env`, which is why this works with your `.env` in place.

Run: `npm run start`
Expected: `Nest application successfully started`. Stop it with Ctrl+C. Nothing connects to the database yet, so Postgres doesn't need to be running.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: validate environment variables with a Zod schema"
```

---

### Task 3: Problem Details error format (spec test 9)

**Files:**
- Create: `src/platform/errors/request-validation.ts`, `src/platform/errors/problem-details.ts`, `src/platform/errors/problem-details.spec.ts`, `src/platform/errors/problem-details.filter.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `AppModule` from Task 2.
- Produces:
  - `type FieldError = { path: string; message: string }`, `class RequestValidationException extends BadRequestException` (constructor `(fieldErrors: FieldError[])`, property `fieldErrors`), and `class RequestValidationPipe` from `src/platform/errors/request-validation.ts`.
  - `type ProblemDetails`, `const PROBLEM_JSON = 'application/problem+json'`, and `toProblemDetails(exception: unknown, instance: string): ProblemDetails` from `src/platform/errors/problem-details.ts`.
  - `class ProblemDetailsFilter` from `src/platform/errors/problem-details.filter.ts`.
  - Global registration: every validation failure becomes a 400, and every error leaves as Problem Details.

- [ ] **Step 1: Write the failing test** in `src/platform/errors/problem-details.spec.ts`

```ts
import { NotFoundException } from '@nestjs/common';
import { toProblemDetails } from './problem-details.js';
import { RequestValidationException } from './request-validation.js';

describe('toProblemDetails', () => {
  it('hides the details of an unexpected error behind a generic 500', () => {
    const problem = toProblemDetails(
      new Error('password authentication failed for user "admin"'),
      '/problems/two-sum',
    );

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: '/problems/two-sum',
    });
    expect(JSON.stringify(problem)).not.toContain('password');
  });

  it('keeps the message of a 4xx HttpException', () => {
    const problem = toProblemDetails(new NotFoundException("Problem 'two-summ' was not found."), '/problems/two-summ');

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: "Problem 'two-summ' was not found.",
      instance: '/problems/two-summ',
    });
  });

  it('lists the field errors of a validation failure', () => {
    const exception = new RequestValidationException([
      { path: 'slug', message: 'Use lowercase letters, digits, and single hyphens.' },
    ]);

    expect(toProblemDetails(exception, '/problems/Two_Sum')).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Request validation failed.',
      instance: '/problems/Two_Sum',
      errors: [{ path: 'slug', message: 'Use lowercase letters, digits, and single hyphens.' }],
    });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/platform/errors`
Expected: FAIL, because `./problem-details.js` and `./request-validation.js` cannot be resolved yet.

- [ ] **Step 3: Write the validation exception and pipe** in `src/platform/errors/request-validation.ts`

```ts
import { type ArgumentMetadata, BadRequestException, Injectable, StandardSchemaValidationPipe } from '@nestjs/common';

export type FieldError = { path: string; message: string };

// The shape of a Standard Schema issue, written out so we don't depend on @standard-schema/spec.
type SchemaIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
};

export class RequestValidationException extends BadRequestException {
  constructor(readonly fieldErrors: FieldError[]) {
    super('Request validation failed.');
  }
}

class SchemaIssuesError extends Error {
  constructor(readonly issues: readonly SchemaIssue[]) {
    super('Schema validation failed.');
  }
}

function toFieldErrors(issues: readonly SchemaIssue[], parameter: string | undefined): FieldError[] {
  return issues.map((issue) => {
    const segments = (issue.path ?? []).map((segment) =>
      String(typeof segment === 'object' ? segment.key : segment),
    );
    return { path: [parameter, ...segments].filter(Boolean).join('.'), message: issue.message };
  });
}

/**
 * Nest's schema validation pipe, with failures turned into a RequestValidationException.
 * The parameter name is prefixed to each path because a schema on a single parameter,
 * like @Param('slug', { schema }), reports its issues without one.
 */
@Injectable()
export class RequestValidationPipe extends StandardSchemaValidationPipe {
  constructor() {
    super({ exceptionFactory: (issues) => new SchemaIssuesError(issues) });
  }

  override async transform<T = unknown>(value: T, metadata: ArgumentMetadata): Promise<T> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof SchemaIssuesError) {
        throw new RequestValidationException(toFieldErrors(error.issues, metadata.data));
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Write the mapping** in `src/platform/errors/problem-details.ts`

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { type FieldError, RequestValidationException } from './request-validation.js';

/** An RFC 9457 Problem Details body. */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: FieldError[];
};

export const PROBLEM_JSON = 'application/problem+json';

export function toProblemDetails(exception: unknown, instance: string): ProblemDetails {
  const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  // A 5xx message can carry internals such as SQL, hostnames or credentials, so only the log sees it.
  const detail =
    exception instanceof HttpException && status < 500 ? exception.message : 'An unexpected error occurred.';

  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail,
    instance,
    ...(exception instanceof RequestValidationException ? { errors: exception.fieldErrors } : {}),
  };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/platform/errors`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the filter** in `src/platform/errors/problem-details.filter.ts`

```ts
import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PROBLEM_JSON, toProblemDetails } from './problem-details.js';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const problem = toProblemDetails(exception, request.path);

    if (problem.status >= 500) {
      this.logger.error(
        `${request.method} ${request.path} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    http.getResponse<Response>().status(problem.status).type(PROBLEM_JSON).json(problem);
  }
}
```

- [ ] **Step 7: Register the pipe and filter globally.** Replace `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { envSchema } from './platform/config/env.schema.js';
import { ProblemDetailsFilter } from './platform/errors/problem-details.filter.js';
import { RequestValidationPipe } from './platform/errors/request-validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests get their settings from the test setup, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validationSchema: envSchema,
    }),
  ],
  providers: [
    { provide: APP_PIPE, useClass: RequestValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Verify nothing else broke**

Run: `npm test && npm run lint && npm run typecheck`
Expected: 8 tests pass; lint and typecheck exit 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: return every error as RFC 9457 Problem Details"
```

---

### Task 4: Problems tables, local Postgres, and the first migration

**Files:**
- Create: `docker-compose.yml`, `drizzle.config.ts`, `src/modules/problems/problems.tables.ts`, `drizzle/` (generated)
- Modify: `package.json`

**Interfaces:**
- Consumes: `.env` from Task 2.
- Produces, from `src/modules/problems/problems.tables.ts`: `difficultyEnum`, `languageEnum`, `problems`, `problemLanguages`, `type Difficulty = 'easy' | 'medium' | 'hard'`, `type Language = 'javascript' | 'python'`. Also the npm scripts `db:generate` and `db:migrate`.

This task's deliverable is checked by inspecting the database. Task 5's e2e harness then applies the same migrations to every test database.

- [ ] **Step 1: Install Drizzle and the Postgres driver**

```bash
npm install pg
npm install --save-exact drizzle-orm@1.0.0-rc.5
npm install --save-dev --save-exact drizzle-kit@1.0.0-rc.5
npm install --save-dev @types/pg
```

Check that `package.json` lists `"drizzle-orm": "1.0.0-rc.5"` and `"drizzle-kit": "1.0.0-rc.5"` with no `^`.

- [ ] **Step 2: Define the local database** in `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: mock_interview
    ports:
      - '5432:5432'
    volumes:
      # Postgres 18 images keep their data in a versioned folder under this path.
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d mock_interview']
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  pgdata:
```

- [ ] **Step 3: Start it**

Run: `docker compose up -d --wait`
Expected: `Container ai-mock-interview-db-1  Healthy`.

- [ ] **Step 4: Define the tables** in `src/modules/problems/problems.tables.ts`

```ts
import { sql } from 'drizzle-orm';
import { check, integer, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard']);
export const languageEnum = pgEnum('language', ['javascript', 'python']);

export type Difficulty = (typeof difficultyEnum.enumValues)[number];
export type Language = (typeof languageEnum.enumValues)[number];

export const problems = pgTable(
  'problems',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    description: text().notNull(),
    difficulty: difficultyEnum().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Mirrors problemSlugSchema, so the database never holds a slug the API would reject.
    check('problems_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${table.slug}) <= 100`),
  ],
);

export const problemLanguages = pgTable(
  'problem_languages',
  {
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    language: languageEnum().notNull(),
    starterCode: text('starter_code').notNull(),
    referenceSolution: text('reference_solution').notNull(),
  },
  (table) => [primaryKey({ columns: [table.problemId, table.language] })],
);
```

- [ ] **Step 5: Configure drizzle-kit** in `drizzle.config.ts`

```ts
import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Nest, so it reads .env itself. CI passes real environment variables instead.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/*.tables.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
```

- [ ] **Step 6: Add the migration scripts**

```bash
npm pkg set scripts.db:generate="drizzle-kit generate"
npm pkg set scripts.db:migrate="drizzle-kit migrate"
```

- [ ] **Step 7: Generate the first migration and read it**

Run: `npm run db:generate -- --name create_problems`
Expected: `[✓] Your SQL migration ➜ drizzle/<timestamp>_create_problems/migration.sql`. Drizzle 1.0 writes one folder per migration, holding `migration.sql` and `snapshot.json`.

Read `migration.sql`; it's the exact SQL your database will run. It should create the `difficulty` and `language` enums, the `problems` table (identity `id`, `slug text NOT NULL UNIQUE`, and the `problems_slug_format` check), and the `problem_languages` table with `PRIMARY KEY("problem_id","language")`, followed by the foreign key `... REFERENCES "problems"("id") ON DELETE CASCADE`.

- [ ] **Step 8: Apply it and inspect the result**

Run: `npm run db:migrate`
Expected: `[✓] migrations applied successfully!`

Run: `docker compose exec db psql -U postgres -d mock_interview -c '\d problem_languages'`
Expected: four `not null` columns, `"problem_languages_pkey" PRIMARY KEY, btree (problem_id, language)`, and `"problem_languages_problem_id_problems_id_fkey" FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add problems tables and the first migration"
```

---

### Task 5: Database module, health check, and the e2e harness (spec test 5)

**Files:**
- Create: `src/platform/database/database.ts`, `src/platform/database/database.module.ts`, `src/platform/health/database.health.ts`, `src/platform/health/health-check-failure.filter.ts`, `src/platform/health/health.controller.ts`, `src/platform/health/health.module.ts`, `test/setup/postgres.global-setup.ts`, `test/setup/env.setup.ts`, `test/support/test-app.ts`, `test/health.e2e-spec.ts`
- Modify: `vitest.config.e2e.ts`, `src/app.module.ts`

**Interfaces:**
- Consumes: `Env` (Task 2), the global filter and pipe (Task 3), and the `drizzle/` migrations (Task 4).
- Produces:
  - `type Database = NodePgDatabase` from `src/platform/database/database.ts`. Inject it with `@InjectDrizzle() private readonly db: Database`.
  - `DatabaseModule` and `HealthModule`, both imported by `AppModule`.
  - `createTestApp(customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder): Promise<INestApplication>` from `test/support/test-app.ts`.
  - The Vitest value `inject('databaseUrl')`, provided by the global setup.

- [ ] **Step 1: Install the packages**

```bash
npm install @nestjs/drizzle@0.0.2 @nestjs/terminus
npm install --save-dev @testcontainers/postgresql
```

- [ ] **Step 2: Start a Postgres container for each e2e run.** Create `test/setup/postgres.global-setup.ts`:

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Runs once per e2e run: one throwaway Postgres with the real migrations applied. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const databaseUrl = container.getConnectionUri();

  const db = drizzle(databaseUrl);
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.$client.end();

  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await container.stop();
  };
}
```

Create `test/setup/env.setup.ts`:

```ts
import { inject } from 'vitest';

// Runs before each e2e file is imported. ConfigModule reads process.env when AppModule is imported.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = inject('databaseUrl');
```

Replace `vitest.config.e2e.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/postgres.global-setup.ts'],
    setupFiles: ['./test/setup/env.setup.ts'],
    // The e2e files share one database and empty it between tests, so they run one at a time.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
```

- [ ] **Step 3: Write the app factory** in `test/support/test-app.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';

/** Boots the real AppModule. `customize` can override providers for one test file. */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
```

- [ ] **Step 4: Write the failing e2e test** in `test/health.e2e-spec.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DatabaseHealthIndicator } from '../src/platform/health/database.health.js';
import { createTestApp } from './support/test-app.js';

describe('GET /health', () => {
  describe('when the database answers', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with the database up', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
    });
  });

  describe('when the database check fails', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createTestApp((builder) =>
        builder.overrideProvider(DatabaseHealthIndicator).useFactory({
          factory: (indicators: HealthIndicatorService) => ({
            isHealthy: (key: string) => indicators.check(key).down({ message: 'database unreachable' }),
          }),
          inject: [HealthIndicatorService],
        }),
      );
    });

    afterAll(async () => {
      await app.close();
    });

    it("returns 503 with Terminus's own body, not Problem Details", async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(503);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toMatchObject({
        status: 'error',
        error: { database: { status: 'down', message: 'database unreachable' } },
      });
    });
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npm run test:e2e`
Expected: the Postgres container starts (the first run downloads the image), then FAIL, because `../src/platform/health/database.health.js` cannot be resolved yet.

- [ ] **Step 6: Write the database type and module**

`src/platform/database/database.ts`:

```ts
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** The Drizzle database that repositories receive through @InjectDrizzle(). */
export type Database = NodePgDatabase;
```

`src/platform/database/database.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.schema.js';

// DrizzleModule is global: any provider can inject the database with @InjectDrizzle().
// It closes the connection pool when the app shuts down.
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
  ],
})
export class DatabaseModule {}
```

- [ ] **Step 7: Write the health check**

`src/platform/health/database.health.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';

@Injectable()
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectDrizzle() private readonly db: Database,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.db.execute(sql`select 1`);
      return indicator.up();
    } catch (error) {
      this.logger.error('Database health check failed', error instanceof Error ? error.stack : String(error));
      // /health is public, so the real error stays in the log.
      return indicator.down({ message: 'database unreachable' });
    }
  }
}
```

`src/platform/health/health-check-failure.filter.ts`:

```ts
import { type ArgumentsHost, Catch, type ExceptionFilter, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

/** Keeps Terminus's own 503 body, which load balancers and humans read, instead of Problem Details. */
@Catch(ServiceUnavailableException)
export class HealthCheckFailureFilter implements ExceptionFilter {
  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(exception.getResponse());
  }
}
```

`src/platform/health/health.controller.ts`:

```ts
import { Controller, Get, UseFilters } from '@nestjs/common';
import { HealthCheck, type HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthCheckFailureFilter } from './health-check-failure.filter.js';

@Controller('health')
@UseFilters(HealthCheckFailureFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
```

`src/platform/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
```

- [ ] **Step 8: Wire both modules into the app.** Replace `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { envSchema } from './platform/config/env.schema.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ProblemDetailsFilter } from './platform/errors/problem-details.filter.js';
import { RequestValidationPipe } from './platform/errors/request-validation.js';
import { HealthModule } from './platform/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests get their settings from the test setup, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validationSchema: envSchema,
    }),
    DatabaseModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: RequestValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
```

- [ ] **Step 9: Run the e2e tests and watch them pass**

Run: `npm run test:e2e`
Expected: PASS, 2 tests, in roughly 10 seconds including the container start. A red `Health Check has failed! {"database":{"message":"database unreachable","status":"down"}}` log line is expected: Terminus logs it during the 503 test.

- [ ] **Step 10: Verify the rest and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass.

```bash
git add -A
git commit -m "feat: add database module, health check and e2e harness"
```

---

### Task 6: Problem schemas (spec test 8)

**Files:**
- Create: `src/modules/problems/problems.dto.ts`, `src/modules/problems/problems.dto.spec.ts`

**Interfaces:**
- Consumes: `difficultyEnum` and `languageEnum` from Task 4.
- Produces, from `src/modules/problems/problems.dto.ts`: `problemSlugSchema`, `problemDetailSchema`, `problemResponseSchema`, `type ProblemDetail = { slug: string; title: string; difficulty: Difficulty; description: string; languages: { language: Language; starterCode: string }[] }`, and `type ProblemResponse = { data: ProblemDetail }`.

- [ ] **Step 1: Write the failing test** in `src/modules/problems/problems.dto.spec.ts`

```ts
import { problemSlugSchema } from './problems.dto.js';

describe('problemSlugSchema', () => {
  it.each(['two-sum', 'a', '3sum', 'reverse-linked-list-2', 'a'.repeat(100)])('accepts %s', (slug) => {
    expect(problemSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    ['uppercase letters', 'Two-Sum'],
    ['an underscore', 'two_sum'],
    ['a leading hyphen', '-two-sum'],
    ['a trailing hyphen', 'two-sum-'],
    ['a double hyphen', 'two--sum'],
    ['an empty string', ''],
    ['101 characters', 'a'.repeat(101)],
  ])('rejects %s', (_label, slug) => {
    expect(problemSlugSchema.safeParse(slug).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/modules/problems`
Expected: FAIL, because `./problems.dto.js` cannot be resolved yet.

- [ ] **Step 3: Write the schemas** in `src/modules/problems/problems.dto.ts`

```ts
import { z } from 'zod';
import { difficultyEnum, languageEnum } from './problems.tables.js';

export const problemSlugSchema = z
  .string()
  .max(100, 'Must be at most 100 characters.')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits, and single hyphens.');

export const problemDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: z.enum(difficultyEnum.enumValues),
  description: z.string(),
  languages: z.array(
    z.object({
      language: z.enum(languageEnum.enumValues),
      starterCode: z.string(),
    }),
  ),
});

/** Success bodies are { data, meta? }. This endpoint has nothing for meta. */
export const problemResponseSchema = z.object({ data: problemDetailSchema });

export type ProblemDetail = z.infer<typeof problemDetailSchema>;
export type ProblemResponse = z.infer<typeof problemResponseSchema>;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/modules/problems`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add problem slug and response schemas"
```

---

### Task 7: `GET /problems/:slug` (spec tests 1–4)

**Files:**
- Create: `test/support/database.ts`, `test/problems.e2e-spec.ts`, `src/modules/problems/problems.repository.ts`, `src/modules/problems/problems.service.ts`, `src/modules/problems/problems.controller.ts`, `src/modules/problems/problems.module.ts`, `src/modules/problems/index.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `Database` and `createTestApp` (Task 5); the tables (Task 4); the schemas and types (Task 6).
- Produces:
  - `ProblemsRepository.findPublicBySlug(slug: string): Promise<ProblemDetail | undefined>`
  - `ProblemsService.getBySlug(slug: string): Promise<ProblemDetail>`, which throws `NotFoundException` when the slug is unknown.
  - `ProblemsModule`, exported from `src/modules/problems/index.ts`.
  - From `test/support/database.ts`: `getDatabase(app)`, `resetDatabase(db)`, `insertProblem(db, fixture)`, and `type ProblemFixture`.

- [ ] **Step 1: Write the test helpers** in `test/support/database.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import {
  type Difficulty,
  type Language,
  problemLanguages,
  problems,
} from '../../src/modules/problems/problems.tables.js';
import type { Database } from '../../src/platform/database/database.js';

export type ProblemFixture = {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  languages: { language: Language; starterCode: string; referenceSolution: string }[];
};

export function getDatabase(app: INestApplication): Database {
  return app.get<Database>(getDrizzleToken());
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`truncate table problem_languages, problems restart identity cascade`);
}

export async function insertProblem(db: Database, fixture: ProblemFixture): Promise<void> {
  const { languages, ...problem } = fixture;
  const [inserted] = await db.insert(problems).values(problem).returning({ id: problems.id });
  await db.insert(problemLanguages).values(languages.map((language) => ({ problemId: inserted.id, ...language })));
}
```

- [ ] **Step 2: Write the failing e2e tests** in `test/problems.e2e-spec.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Database } from '../src/platform/database/database.js';
import { getDatabase, insertProblem, type ProblemFixture, resetDatabase } from './support/database.js';
import { createTestApp } from './support/test-app.js';

const twoSum: ProblemFixture = {
  slug: 'two-sum',
  title: 'Two Sum',
  description: 'Return the indices of the two numbers that add up to `target`.',
  difficulty: 'easy',
  // Python is inserted first to prove the API sorts languages itself.
  languages: [
    {
      language: 'python',
      starterCode: 'def two_sum(nums, target):\n    pass\n',
      referenceSolution: 'SECRET-PYTHON-SOLUTION',
    },
    {
      language: 'javascript',
      starterCode: 'function twoSum(nums, target) {}\n',
      referenceSolution: 'SECRET-JAVASCRIPT-SOLUTION',
    },
  ],
};

describe('GET /problems/:slug', () => {
  let app: INestApplication<App>;
  let db: Database;

  beforeAll(async () => {
    app = await createTestApp();
    db = getDatabase(app);
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('failures', () => {
    it('returns 404 Problem Details for an unknown slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/problems/does-not-exist')
        .expect(404)
        .expect('Content-Type', /^application\/problem\+json/);

      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "Problem 'does-not-exist' was not found.",
        instance: '/problems/does-not-exist',
      });
    });

    it('returns 400 Problem Details with field errors for a malformed slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/problems/Two_Sum')
        .expect(400)
        .expect('Content-Type', /^application\/problem\+json/);

      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Request validation failed.',
        instance: '/problems/Two_Sum',
        errors: [{ path: 'slug', message: 'Use lowercase letters, digits, and single hyphens.' }],
      });
    });
  });

  describe('success', () => {
    beforeEach(async () => {
      await insertProblem(db, twoSum);
    });

    it('returns the problem with every offered language, in order', async () => {
      const response = await request(app.getHttpServer()).get('/problems/two-sum').expect(200);

      expect(response.body).toEqual({
        data: {
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: 'easy',
          description: 'Return the indices of the two numbers that add up to `target`.',
          languages: [
            { language: 'javascript', starterCode: 'function twoSum(nums, target) {}\n' },
            { language: 'python', starterCode: 'def two_sum(nums, target):\n    pass\n' },
          ],
        },
      });
    });

    it('never includes the reference solution', async () => {
      const response = await request(app.getHttpServer()).get('/problems/two-sum').expect(200);

      expect(response.text).not.toContain('SECRET');
      expect(response.text).not.toContain('referenceSolution');
    });
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npm run test:e2e`
Expected: the 2 health tests pass; the 4 new tests FAIL. The route doesn't exist yet, so every request gets a 404 whose `detail` reads `Cannot GET /problems/...`.

- [ ] **Step 4: Write the repository** in `src/modules/problems/problems.repository.ts`

```ts
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../platform/database/database.js';
import type { ProblemDetail } from './problems.dto.js';
import { problemLanguages, problems } from './problems.tables.js';

@Injectable()
export class ProblemsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Selects public columns only; reference_solution never leaves the database on this path. */
  async findPublicBySlug(slug: string): Promise<ProblemDetail | undefined> {
    const [problem] = await this.db
      .select({
        id: problems.id,
        slug: problems.slug,
        title: problems.title,
        difficulty: problems.difficulty,
        description: problems.description,
      })
      .from(problems)
      .where(eq(problems.slug, slug));

    if (!problem) {
      return undefined;
    }

    const languages = await this.db
      .select({ language: problemLanguages.language, starterCode: problemLanguages.starterCode })
      .from(problemLanguages)
      .where(eq(problemLanguages.problemId, problem.id))
      .orderBy(asc(problemLanguages.language));

    return {
      slug: problem.slug,
      title: problem.title,
      difficulty: problem.difficulty,
      description: problem.description,
      languages,
    };
  }
}
```

- [ ] **Step 5: Write the service** in `src/modules/problems/problems.service.ts`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProblemDetail } from './problems.dto.js';
import { ProblemsRepository } from './problems.repository.js';

@Injectable()
export class ProblemsService {
  constructor(private readonly problemsRepository: ProblemsRepository) {}

  async getBySlug(slug: string): Promise<ProblemDetail> {
    const problem = await this.problemsRepository.findPublicBySlug(slug);
    if (!problem) {
      throw new NotFoundException(`Problem '${slug}' was not found.`);
    }
    return problem;
  }
}
```

- [ ] **Step 6: Write the controller, module, and public API**

`src/modules/problems/problems.controller.ts`:

```ts
import { Controller, Get, Param, SerializeOptions } from '@nestjs/common';
import { type ProblemResponse, problemResponseSchema, problemSlugSchema } from './problems.dto.js';
import { ProblemsService } from './problems.service.js';

@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get(':slug')
  @SerializeOptions({ schema: problemResponseSchema })
  async getBySlug(@Param('slug', { schema: problemSlugSchema }) slug: string): Promise<ProblemResponse> {
    return { data: await this.problemsService.getBySlug(slug) };
  }
}
```

`src/modules/problems/problems.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ProblemsController } from './problems.controller.js';
import { ProblemsRepository } from './problems.repository.js';
import { ProblemsService } from './problems.service.js';

@Module({
  controllers: [ProblemsController],
  providers: [ProblemsService, ProblemsRepository],
})
export class ProblemsModule {}
```

`src/modules/problems/index.ts`:

```ts
// The public API of the problems module. Code outside the module imports only from here.
export { ProblemsModule } from './problems.module.js';
```

- [ ] **Step 7: Register the module and the response serializer.** Replace `src/app.module.ts`:

```ts
import { Module, StandardSchemaSerializerInterceptor } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ProblemsModule } from './modules/problems/index.js';
import { envSchema } from './platform/config/env.schema.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ProblemDetailsFilter } from './platform/errors/problem-details.filter.js';
import { RequestValidationPipe } from './platform/errors/request-validation.js';
import { HealthModule } from './platform/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests get their settings from the test setup, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validationSchema: envSchema,
    }),
    DatabaseModule,
    HealthModule,
    ProblemsModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: RequestValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Responses pass through the schema in @SerializeOptions, which drops undeclared fields.
    { provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor },
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Run the e2e tests and watch them pass**

Run: `npm run test:e2e`
Expected: PASS, 6 tests.

- [ ] **Step 9: Verify the rest and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass.

```bash
git add -A
git commit -m "feat: serve problem details at GET /problems/:slug"
```

---

### Task 8: App setup: helmet, CORS, and OpenAPI docs

**Files:**
- Create: `src/app.setup.ts`, `test/app-setup.e2e-spec.ts`
- Modify: `test/support/test-app.ts`, `src/main.ts`, `src/modules/problems/problems.controller.ts`, `src/platform/health/health.controller.ts`

**Interfaces:**
- Consumes: `createTestApp` (Task 5), `ProblemsController` (Task 7), `HealthController` (Task 5).
- Produces: `configureApp(app: INestApplication): void` from `src/app.setup.ts`, called by `main.ts` and `createTestApp`.

These checks go beyond the spec's nine tests: they cover the helmet, CORS and OpenAPI behavior that the spec requires.

- [ ] **Step 1: Install the packages**

```bash
npm install @nestjs/swagger helmet
```

- [ ] **Step 2: Write the failing e2e tests** in `test/app-setup.e2e-spec.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './support/test-app.js';

describe('app setup', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends security headers', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows the configured frontend origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow other origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://elsewhere.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('documents GET /problems/{slug} but not /health', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(response.body.paths['/problems/{slug}'].get).toBeDefined();
    expect(response.body.paths['/health']).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npm run test:e2e`
Expected: 3 of the 4 new tests FAIL: no security header, no CORS header for the allowed origin, and `/docs-json` returns 404. "does not allow other origins" already passes, because the app sends no CORS headers at all yet. It guards against a too-permissive setup later.

- [ ] **Step 4: Write the setup function** in `src/app.setup.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Env } from './platform/config/env.schema.js';

/** HTTP-level setup. main.ts and the e2e tests both call it, so tests run the production wiring. */
export function configureApp(app: INestApplication): void {
  const config: ConfigService<Env, true> = app.get(ConfigService);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  app.use(
    helmet({
      // Safari applies upgrade-insecure-requests even to http://localhost, which breaks /docs in development.
      contentSecurityPolicy: isProduction ? undefined : { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

  if (!isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('ai-mock-interview API').setVersion('0.1.0').build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
```

- [ ] **Step 5: Call it from the test factory and from `main.ts`**

Replace `test/support/test-app.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

/** Boots the real AppModule with the production setup. `customize` can override providers. */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
```

Replace `src/main.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './platform/config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // On a stop signal, finish in-flight requests and close the database pool.
  app.enableShutdownHooks();

  const config: ConfigService<Env, true> = app.get(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
```

- [ ] **Step 6: Describe the endpoint for the docs.** Replace `src/modules/problems/problems.controller.ts`:

```ts
import { Controller, Get, Param, SerializeOptions } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type ProblemResponse, problemResponseSchema, problemSlugSchema } from './problems.dto.js';
import { ProblemsService } from './problems.service.js';

@ApiTags('problems')
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get(':slug')
  @SerializeOptions({ schema: problemResponseSchema })
  @ApiOkResponse({
    description: 'The problem and its starter code for each offered language.',
    standardSchema: problemResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'The slug is malformed. The body is Problem Details.' })
  @ApiNotFoundResponse({ description: 'No problem has this slug. The body is Problem Details.' })
  async getBySlug(@Param('slug', { schema: problemSlugSchema }) slug: string): Promise<ProblemResponse> {
    return { data: await this.problemsService.getBySlug(slug) };
  }
}
```

In `src/platform/health/health.controller.ts`, hide the health check from the API docs. Add the import and the decorator:

```ts
import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, type HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthCheckFailureFilter } from './health-check-failure.filter.js';

@ApiExcludeController()
@Controller('health')
@UseFilters(HealthCheckFailureFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
```

- [ ] **Step 7: Run the e2e tests and watch them pass**

Run: `npm run test:e2e`
Expected: PASS, 10 tests.

- [ ] **Step 8: Look at the docs yourself**

Run: `npm run start:dev`, then open `http://localhost:3000/docs`.
Expected: Swagger UI lists `GET /problems/{slug}` with its response schema. `http://localhost:3000/problems/two-sum` returns a 404 Problem Details body until Task 9 seeds data. Stop the server.

- [ ] **Step 9: Verify the rest and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass.

```bash
git add -A
git commit -m "feat: add security headers, CORS and OpenAPI docs"
```

---

### Task 9: Development seed

**Files:**
- Create: `src/modules/problems/problems.seed.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `envSchema` (Task 2) and the tables (Task 4).
- Produces: the `db:seed` npm script.

The seed is development tooling, so you check it by running it, not with an automated test.

- [ ] **Step 1: Install tsx, which runs TypeScript files directly**

```bash
npm install --save-dev tsx
```

- [ ] **Step 2: Write the seed** in `src/modules/problems/problems.seed.ts`

```ts
import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { envSchema } from '../../platform/config/env.schema.js';
import { type Difficulty, type Language, problemLanguages, problems } from './problems.tables.js';

type SeedProblem = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  description: string;
  languages: { language: Language; starterCode: string; referenceSolution: string }[];
};

const lines = (...text: string[]): string => text.join('\n');

const seedProblems: SeedProblem[] = [
  {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    description: lines(
      'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.',
      '',
      'Each input has exactly one solution, and you may not use the same element twice. Return the answer in any order.',
      '',
      '**Example 1**',
      '',
      '    Input: nums = [2,7,11,15], target = 9',
      '    Output: [0,1]',
      '',
      '**Example 2**',
      '',
      '    Input: nums = [3,2,4], target = 6',
      '    Output: [1,2]',
      '',
      '**Constraints**',
      '',
      '- `2 <= nums.length <= 10^4`',
      '- `-10^9 <= nums[i] <= 10^9`',
    ),
    languages: [
      {
        language: 'javascript',
        starterCode: lines(
          '/**',
          ' * @param {number[]} nums',
          ' * @param {number} target',
          ' * @return {number[]}',
          ' */',
          'function twoSum(nums, target) {',
          '',
          '}',
        ),
        referenceSolution: lines(
          'function twoSum(nums, target) {',
          '  const seen = new Map();',
          '  for (let i = 0; i < nums.length; i++) {',
          '    const complement = target - nums[i];',
          '    if (seen.has(complement)) return [seen.get(complement), i];',
          '    seen.set(nums[i], i);',
          '  }',
          '  return [];',
          '}',
        ),
      },
      {
        language: 'python',
        starterCode: lines(
          'class Solution:',
          '    def twoSum(self, nums: list[int], target: int) -> list[int]:',
          '        pass',
        ),
        referenceSolution: lines(
          'class Solution:',
          '    def twoSum(self, nums: list[int], target: int) -> list[int]:',
          '        seen = {}',
          '        for i, num in enumerate(nums):',
          '            if target - num in seen:',
          '                return [seen[target - num], i]',
          '            seen[num] = i',
          '        return []',
        ),
      },
    ],
  },
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    description: lines(
      'Given a string `s` containing only the characters `(`, `)`, `{`, `}`, `[` and `]`, determine whether it is valid.',
      '',
      'A string is valid when every open bracket is closed by the same type of bracket, in the correct order.',
      '',
      '**Example 1**',
      '',
      '    Input: s = "()[]{}"',
      '    Output: true',
      '',
      '**Example 2**',
      '',
      '    Input: s = "(]"',
      '    Output: false',
      '',
      '**Constraints**',
      '',
      '- `1 <= s.length <= 10^4`',
    ),
    languages: [
      {
        language: 'javascript',
        starterCode: lines(
          '/**',
          ' * @param {string} s',
          ' * @return {boolean}',
          ' */',
          'function isValid(s) {',
          '',
          '}',
        ),
        referenceSolution: lines(
          'function isValid(s) {',
          "  const pairs = { ')': '(', ']': '[', '}': '{' };",
          '  const stack = [];',
          '  for (const char of s) {',
          '    if (char in pairs) {',
          '      if (stack.pop() !== pairs[char]) return false;',
          '    } else {',
          '      stack.push(char);',
          '    }',
          '  }',
          '  return stack.length === 0;',
          '}',
        ),
      },
      {
        language: 'python',
        starterCode: lines('class Solution:', '    def isValid(self, s: str) -> bool:', '        pass'),
        referenceSolution: lines(
          'class Solution:',
          '    def isValid(self, s: str) -> bool:',
          '        pairs = {")": "(", "]": "[", "}": "{"}',
          '        stack = []',
          '        for char in s:',
          '            if char in pairs:',
          '                if not stack or stack.pop() != pairs[char]:',
          '                    return False',
          '            else:',
          '                stack.append(char)',
          '        return not stack',
        ),
      },
    ],
  },
];

const logger = new Logger('Seed');
const env = envSchema.parse(process.env);
const db = drizzle(env.DATABASE_URL);

try {
  for (const { languages, ...problem } of seedProblems) {
    // Upserts, so running the seed again updates rows instead of duplicating them.
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(problems)
        .values(problem)
        .onConflictDoUpdate({
          target: problems.slug,
          set: {
            title: problem.title,
            difficulty: problem.difficulty,
            description: problem.description,
            updatedAt: new Date(),
          },
        })
        .returning({ id: problems.id });

      for (const language of languages) {
        await tx
          .insert(problemLanguages)
          .values({ problemId: row.id, ...language })
          .onConflictDoUpdate({
            target: [problemLanguages.problemId, problemLanguages.language],
            set: { starterCode: language.starterCode, referenceSolution: language.referenceSolution },
          });
      }
    });
  }
  logger.log(`Seeded ${seedProblems.length} problems.`);
} finally {
  await db.$client.end();
}
```

- [ ] **Step 3: Add the script**

```bash
npm pkg set scripts.db:seed="tsx --env-file-if-exists=.env src/modules/problems/problems.seed.ts"
```

- [ ] **Step 4: Run it twice**

Run: `npm run db:seed && npm run db:seed`
Expected: `[Seed] Seeded 2 problems.` both times, in Nest's log format.

Run: `docker compose exec db psql -U postgres -d mock_interview -c 'select count(*) from problem_languages'`
Expected: `4`. The second run updated rows instead of duplicating them.

- [ ] **Step 5: See it end to end**

Run: `npm run start:dev`, then in another terminal `curl -s http://localhost:3000/problems/two-sum`
Expected: `{"data":{"slug":"two-sum","title":"Two Sum","difficulty":"easy",...}}` with JavaScript and Python starter code, and no reference solution. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add a development seed with two problems"
```

---

### Task 10: Module boundaries and lint rules (spec test 7)

**Files:**
- Create: `.dependency-cruiser.cjs`, `test/architecture/boundaries.spec.ts`, `test/architecture/fixtures/tsconfig.json`, and the fixture sources listed in step 2
- Modify: `.oxlintrc.json`, `package.json`

**Interfaces:**
- Consumes: the source layout from Tasks 2–9.
- Produces: the npm scripts `lint` (oxlint, then dependency-cruiser), `lint:code`, `lint:arch`, and `arch:graph`.

- [ ] **Step 1: Install dependency-cruiser**

```bash
npm install --save-dev dependency-cruiser
```

- [ ] **Step 2: Plant violations in a fixture project.** Each file is tiny; together they break every rule once and include two allowed imports.

`test/architecture/fixtures/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2023",
    "strict": true
  }
}
```

`test/architecture/fixtures/src/modules/billing/billing.config.ts`:

```ts
export const currencyDecimals = 2;
```

`test/architecture/fixtures/src/modules/billing/internal/rounding.ts` (allowed: same module, from a subfolder):

```ts
import { currencyDecimals } from '../billing.config.js';

export const round = (value: number): number => Number(value.toFixed(currencyDecimals));
```

`test/architecture/fixtures/src/modules/billing/billing.service.ts`:

```ts
import { round } from './internal/rounding.js';

export const charge = (amount: number): number => round(amount);
```

`test/architecture/fixtures/src/modules/billing/index.ts`:

```ts
export { charge } from './billing.service.js';
```

`test/architecture/fixtures/src/modules/orders/index.ts` (allowed: another module's public API):

```ts
import { charge } from '../billing/index.js';

export const placeOrder = (amount: number): number => charge(amount);
```

`test/architecture/fixtures/src/modules/orders/orders.service.ts` (violation: another module's internals):

```ts
import { charge } from '../billing/billing.service.js';

export const refund = (amount: number): number => -charge(amount);
```

`test/architecture/fixtures/src/modules/orders/worker/order.worker.ts` (violation: internals, from a subfolder):

```ts
import { charge } from '../../billing/billing.service.js';

export const processOrder = (amount: number): number => charge(amount);
```

`test/architecture/fixtures/src/platform/clock.ts` (violation: platform depends on a module):

```ts
import { charge } from '../modules/billing/index.js';

export const billedNow = (): number => charge(Date.now());
```

`test/architecture/fixtures/src/main.ts` (violation: root code imports module internals):

```ts
import { charge } from './modules/billing/billing.service.js';

export const start = (): number => charge(1);
```

`test/architecture/fixtures/src/modules/cycle-a/index.ts`:

```ts
import { b } from '../cycle-b/index.js';

export const a = (): string => `a${b.name}`;
```

`test/architecture/fixtures/src/modules/cycle-b/index.ts` (violation, together with `cycle-a`: an import cycle):

```ts
import { a } from '../cycle-a/index.js';

export const b = (): string => `b${a.name}`;
```

- [ ] **Step 3: Write the failing test** in `test/architecture/boundaries.spec.ts`

```ts
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type Violation = { from: string; to: string; rule: { name: string } };
type CruiseSummary = { violations: Violation[]; totalCruised: number };

const depcruise = resolve('node_modules/.bin/depcruise');
const config = resolve('.dependency-cruiser.cjs');
const fixtures = resolve('test/architecture/fixtures');

function cruiseFixtures(): CruiseSummary {
  const result = spawnSync(depcruise, ['src', '--config', config, '--output-type', 'json'], {
    cwd: fixtures,
    encoding: 'utf8',
  });
  return (JSON.parse(result.stdout) as { summary: CruiseSummary }).summary;
}

describe('module boundary rules', () => {
  let summary: CruiseSummary;

  beforeAll(() => {
    summary = cruiseFixtures();
  });

  it('checks the fixture files', () => {
    // Without a compatible TypeScript, dependency-cruiser checks nothing and still reports success.
    expect(summary.totalCruised).toBeGreaterThan(0);
  });

  it('reports exactly the planted violations', () => {
    const found = summary.violations.map(({ rule, from, to }) => `${rule.name}: ${from} -> ${to}`).sort();

    expect(found).toEqual([
      'app-uses-module-public-api: src/main.ts -> src/modules/billing/billing.service.ts',
      'module-public-api-only: src/modules/orders/orders.service.ts -> src/modules/billing/billing.service.ts',
      'module-public-api-only: src/modules/orders/worker/order.worker.ts -> src/modules/billing/billing.service.ts',
      // dependency-cruiser reports a cycle once, at the edge where it detects it.
      'no-circular: src/modules/cycle-a/index.ts -> src/modules/cycle-b/index.ts',
      'platform-not-to-modules: src/platform/clock.ts -> src/modules/billing/index.ts',
    ]);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run test/architecture`
Expected: FAIL. With no config file, dependency-cruiser prints an error instead of JSON, so `JSON.parse` throws.

- [ ] **Step 5: Write the rules** in `.dependency-cruiser.cjs`

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'module-public-api-only',
      comment: 'A module may use another module only through its index.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'app-uses-module-public-api',
      comment: 'Code outside src/modules may import a module only through its index.ts.',
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: { path: '^src/modules/[^/]+/', pathNot: '^src/modules/[^/]+/index\\.ts$' },
    },
    {
      name: 'platform-not-to-modules',
      comment: 'Platform code must not depend on business modules.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      comment: 'Import cycles make modules impossible to understand or split on their own.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run test/architecture`
Expected: PASS, 2 tests.

- [ ] **Step 7: Add the scripts and the `no-console` rule**

```bash
npm pkg set scripts.lint="npm run lint:code && npm run lint:arch"
npm pkg set scripts.lint:code="oxlint --type-aware src/ test/"
npm pkg set scripts.lint:arch="depcruise src --config .dependency-cruiser.cjs"
npm pkg set scripts.arch:graph="depcruise src --config .dependency-cruiser.cjs --output-type mermaid"
```

Replace `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "rules": {
    "typescript/no-explicit-any": "off",
    "typescript/no-floating-promises": "error",
    "no-console": "error"
  },
  "env": {
    "node": true
  }
}
```

- [ ] **Step 8: Check the real code, and prove `no-console` fires**

Run: `npm run lint`
Expected: oxlint prints nothing, then dependency-cruiser prints `✔ no dependency violations found (N modules, M dependencies cruised)`.

Add `console.log('x');` to the end of `src/main.ts` and run `npm run lint:code`.
Expected: an `eslint(no-console)` error. Remove the line again.

- [ ] **Step 9: Verify the rest and commit**

Run: `npm test && npm run typecheck`
Expected: all pass, including the 2 boundary tests.

```bash
git add -A
git commit -m "feat: enforce module boundaries with dependency-cruiser"
```

---

### Task 11: Production image and Compose smoke test

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: the built app (`nest build` writes `dist/main.js`) and `/health` (Task 5).
- Produces: the `app` Compose service behind the `app` profile, which CI uses in Task 12.

- [ ] **Step 1: Write the image** in `Dockerfile`

```dockerfile
# Build stage: install everything and compile TypeScript.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies and compiled output only.
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

`.dockerignore`:

```
node_modules
dist
coverage
.git
.env
```

- [ ] **Step 2: Add the app service** to `docker-compose.yml`, which becomes:

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: mock_interview
    ports:
      - '5432:5432'
    volumes:
      # Postgres 18 images keep their data in a versioned folder under this path.
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d mock_interview']
      interval: 2s
      timeout: 3s
      retries: 15

  # The production image. Starts only with: docker compose --profile app up
  app:
    profiles: ['app']
    build: .
    environment:
      NODE_ENV: production
      PORT: '3000'
      DATABASE_URL: postgres://postgres:postgres@db:5432/mock_interview
    ports:
      - '3000:3000'
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
      interval: 3s
      timeout: 3s
      retries: 20

volumes:
  pgdata:
```

- [ ] **Step 3: Run the smoke test locally.** Stop any `npm run start:dev` first, because the image needs port 3000.

Run: `docker compose --profile app up --build --wait`
Expected: the image builds, then `Container ai-mock-interview-app-1  Healthy`.

Run: `curl -fsS http://localhost:3000/health`
Expected: `{"status":"ok","info":{"database":{"status":"up"}},"error":{},"details":{"database":{"status":"up"}}}`

Run: `docker compose --profile app stop app`
Expected: the app container stops; your dev database keeps running.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add a production Dockerfile and Compose app profile"
```

---

### Task 12: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: every npm script above, and the Compose `app` profile (Task 11).
- Produces: a check on every push and pull request.

- [ ] **Step 1: Write the workflow** in `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      # Part 1: check the code, directly on the runner.
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run test:e2e
      - run: npm run build

      # Part 2: smoke test the production image next to Postgres.
      - name: Start the app image and Postgres
        run: docker compose --profile app up --build --wait
      - name: Check /health
        run: curl --fail --silent --show-error http://localhost:3000/health
      - name: Stop the containers
        if: always()
        run: docker compose --profile app down -v
```

- [ ] **Step 2: Rehearse the pipeline locally.** These are the same commands in the same order, minus the cleanup that would delete your dev database:

```bash
npm ci && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build \
  && docker compose --profile app up --build --wait \
  && curl --fail --silent --show-error http://localhost:3000/health \
  && docker compose --profile app stop app
```

Expected: every command succeeds and `curl` prints the health JSON.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: run checks and an image smoke test on every push"
```

- [ ] **Step 4 (when the repo is on GitHub): watch the first run**

Push the branch, then open the repository's Actions tab.
Expected: the `CI` workflow runs every step and turns green.

---

### Task 13: README and decision notes

**Files:**
- Modify: `README.md`
- Create: `docs/decisions/0001-day-1-scope.md`, `0002-modular-monolith.md`, `0003-data-layer.md`, `0004-testing.md`, `0005-api-contract.md`, `0006-documentation.md`, `0007-runtime-and-delivery.md` (all in `docs/decisions/`)

**Interfaces:**
- Consumes: everything above.
- Produces: the stale-proof docs from spec section 10.

- [ ] **Step 1: Replace `README.md`**

````markdown
# ai-mock-interview

Backend for a LeetCode-style practice platform. Day 1 serves problem details at `GET /problems/:slug`. Submissions, a job queue, and code execution come next.

## Prerequisites

- Node 26 (`nvm use` reads `.nvmrc`)
- Docker Desktop, running. Postgres runs in Compose, and the e2e tests start their own Postgres container.

## First run

```bash
npm install
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run start:dev
```

Then open `http://localhost:3000/problems/two-sum`, or the API docs at `http://localhost:3000/docs`.

## Commands

| Command | What it does |
|---|---|
| `npm run start:dev` | runs the API with reload |
| `npm test` | unit tests and the module-boundary test |
| `npm run test:e2e` | HTTP tests against a throwaway Postgres |
| `npm run lint` | oxlint, then the module-boundary check |
| `npm run typecheck` | TypeScript, including the tests |
| `npm run db:generate -- --name <change>` | writes a migration after you edit a `*.tables.ts` file |
| `npm run db:migrate` | applies migrations to the database in `.env` |
| `npm run db:seed` | loads the sample problems; safe to rerun |
| `npm run arch:graph` | prints the module dependency graph as Mermaid |
| `docker compose --profile app up --build --wait` | runs the production image next to Postgres |

## Layout

- `src/platform/`: config, database, errors, health
- `src/modules/problems/`: the problems module; `index.ts` is its public API
- `drizzle/`: committed SQL migrations
- `docs/superpowers/specs/`: design specs
- `docs/decisions/`: why things are the way they are
````

- [ ] **Step 2: Write the decision notes**

`docs/decisions/0001-day-1-scope.md`:

```markdown
# 0001: Day 1 scope

- Date: 2026-10-27
- Status: accepted

## Context
Day 1 needs one read endpoint. The prod-forge/backend reference shows many production practices: some cost little now and a lot to retrofit, while others only pay off once the app is deployed.

## Options
1. A bare skeleton: the endpoint, the database, a few tests.
2. The skeleton plus cheap-now foundations: validated config, migrations, request validation, one error format, a health check, OpenAPI, helmet and CORS, and CI.
3. Full prod-forge parity, including metrics, Sentry, rate limiting, release tooling, and infrastructure.

## Decision
Option 2.

## Trade-off accepted
Eight extra concepts on day 1, in exchange for not retrofitting them across every endpoint later.

## Revisit when
The first deployment exists. Then add pino logging, metrics, error tracking, and CD.
```

`docs/decisions/0002-modular-monolith.md`:

```markdown
# 0002: Modular monolith, enforced by dependency-cruiser

- Date: 2026-10-27
- Status: accepted

## Context
One developer, one deployable app. Microservices would add network calls and deployments without a team or scaling need to justify them, but the code still needs boundaries that could later become service seams.

## Options
1. A layered monolith, with folders by technical layer and no ownership rules.
2. A modular monolith: business modules own their tables and expose an `index.ts`, and platform code never imports modules.
3. Boundary enforcement by convention only, by oxlint `no-restricted-imports`, or by dependency-cruiser.

## Decision
A modular monolith, enforced by dependency-cruiser from day 1.

## Trade-off accepted
One more dev tool with a regex-based config, and checks that run from the command line and CI rather than live in the editor. oxlint matches import strings, so it raised false alarms and missed violations inside module subfolders; dependency-cruiser resolves real paths.

## Revisit when
dependency-cruiser supports TypeScript 7 and the project wants to upgrade. Until then TypeScript stays on 6, and the boundary test fails if the rules stop firing.
```

`docs/decisions/0003-data-layer.md`:

```markdown
# 0003: Data layer: Drizzle 1.0 RC, integer IDs with slugs, enums, Postgres 18

- Date: 2026-10-27
- Status: accepted

## Context
Problems need a public URL identifier, a per-language starter code and reference solution, and a migration history from the first table.

## Options
1. Drizzle 0.45 (the `latest` tag) or the 1.0 RC.
2. Integer `id` plus a unique `slug`, a UUID, or the slug as primary key.
3. Postgres enums for language and difficulty, or a `languages` table.
4. Postgres 17 or 18.

## Decision
Drizzle `1.0.0-rc.5`, pinned exactly, since Drizzle's own docs and Nest's guide target it and setup matches 0.45. Integer `id` plus unique `slug`. Postgres enums. Postgres 18, for its native `uuidv7()` when jobs arrive.

## Trade-off accepted
An RC can still change, so upgrades happen deliberately. Adding a language takes a migration. Postgres 18 has a shorter track record than 17.

## Revisit when
Drizzle 1.0 is released (move to it). Languages need user-visible data such as version labels (switch to a `languages` table).
```

`docs/decisions/0004-testing.md`:

```markdown
# 0004: Behavior tests through HTTP on a real Postgres

- Date: 2026-10-27
- Status: accepted

## Context
The code will change daily on day 1 and the days after. Tests must catch real bugs (SQL, migrations, JSON shape, leaked secrets) without breaking on every refactor.

## Options
1. HTTP behavior tests against a real Postgres, plus unit tests for pure logic.
2. Layered tests with mocks for controller, service, and repository.
3. Minimal tests until the code settles.

For the test database: Testcontainers, a second database in the Compose Postgres, or PGlite.

## Decision
Option 1, with Testcontainers: a fresh Postgres every run, identical locally and in CI. E2E files run one at a time because they share it.

## Trade-off accepted
Docker must run, and each e2e run pays the container startup time.

## Revisit when
The e2e suite becomes slow enough to hurt. Then split the database per file (a schema each) and run files in parallel.
```

`docs/decisions/0005-api-contract.md`:

```markdown
# 0005: API contract: Zod schemas, a { data, meta? } envelope, Problem Details errors

- Date: 2026-10-27
- Status: accepted

## Context
The frontend needs one stable shape for successes and one for errors, and cursor pagination is planned for list endpoints.

## Options
1. Validation through class-validator, or through Zod via Nest 12's Standard Schema support.
2. A bare resource, or a `{ data, meta? }` envelope.
3. Nest's default error body, RFC 9457 Problem Details, or a custom error envelope.

## Decision
Zod, one schema per shape, validating requests, allow-listing responses, and generating OpenAPI. Every success uses `{ data, meta? }`. Every error uses Problem Details with `application/problem+json`, and a 5xx never reveals its cause.

## Trade-off accepted
Single-resource responses carry a wrapper they don't strictly need, in exchange for adding pagination later without breaking clients.

## Revisit when
A client needs to branch on specific error kinds. Then add stable `type` URIs or a `code` field.
```

`docs/decisions/0006-documentation.md`:

```markdown
# 0006: Documentation that can't go stale

- Date: 2026-10-27
- Status: accepted

## Context
Prose that describes how the code works drifts within a week while the code changes daily, and wrong docs mislead.

## Options
1. Full docs now (architecture, API, schema), updated with every change.
2. Only docs that can't go stale: generated (OpenAPI, the schema files, migrations), executable (`.env.example`, tests), and dated decision notes.
3. Almost none.

## Decision
Option 2, with comments that explain why, never what.

## Trade-off accepted
No system overview to read for now.

## Revisit when
Any of these happens: submit → queue → worker works end to end (write the architecture overview), the first deployment (write the runbook), or a second contributor joins (write the contributing guide).
```

`docs/decisions/0007-runtime-and-delivery.md`:

```markdown
# 0007: Host development, a production image, hybrid CI, and a Terminus health check

- Date: 2026-10-27
- Status: accepted

## Context
The app must run fast during development, ship as an image later, and be checked on every push.

## Options
1. Develop inside containers, or on the host with a production Dockerfile.
2. CI with everything in Compose, with checks on the runner only, or with runner checks plus a Compose smoke test of the real image.
3. A Terminus health check, or a hand-written controller.

## Decision
Develop on the host, where the toolchain's macOS-native binaries, fast reloads, and F5 debugging work. CI runs the checks on the runner, then boots the production image next to Postgres and requires `/health` to return 200. Terminus serves `/health`.

## Trade-off accepted
The Node version appears in two places, `.nvmrc` and the Dockerfile, so keep them in sync.

## Revisit when
Redis, workers, and Judge0 make the local stack hard to start by hand. Then consider developing in Compose.
```

- [ ] **Step 3: Final verification**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build`
Expected: everything passes: 22 unit tests (env 5, errors 3, slug 12, boundaries 2) and 10 e2e tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README and decision notes"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| 3: scope, cleanup | 1 |
| 4.1–4.4: modular monolith and enforcement | 7 (`index.ts`), 10 |
| 4.5: shared wiring | 3, 7, 8 |
| 5.1–5.4: tables, indexes, Drizzle, migrations | 4 |
| 5.5: seed | 9 |
| 5.6: read path | 7 |
| 6.1–6.5: endpoint, envelope, schemas, secrecy, errors | 3, 6, 7 |
| 6.6: health and docs endpoints | 5, 8 |
| 7.1: configuration | 2 |
| 7.2–7.3: Compose and Dockerfile | 4, 11 |
| 7.4: health check | 5 |
| 7.5: helmet, CORS, shutdown | 8 |
| 7.6: logging | 3, 5, 9, 10 (`no-console`) |
| 7.7: dependencies and scripts | 1–12 |
| 8: CI | 12 |
| 9: tests 1–4 | 7 |
| 9: test 5 | 5 |
| 9: test 6 | 2 |
| 9: test 7 | 10 |
| 9: test 8 | 6 |
| 9: test 9 | 3 |
| 10: documentation | 13, plus `CLAUDE.md` (already written) |
