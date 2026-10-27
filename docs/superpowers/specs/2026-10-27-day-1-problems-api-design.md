# Day 1: Problems API and Project Foundation

- Date: 2026-10-27
- Status: agreed in brainstorming, awaiting spec review
- Repository: `ai-mock-interview`, a NestJS 12 scaffold with no commits yet

## 1. Goal

Serve a problem's details to the frontend through `GET /problems/:slug`, read from Postgres, on a foundation that the later submit → queue → worker → poll flow can build on without rework.

## 2. Product context

The platform is LeetCode-style. The full flow arrives over several days:

1. The frontend fetches a problem and shows its statement and starter code.
2. The user submits code. The backend stores a job, puts it on a queue, and answers with the job ID.
3. Workers drain the queue and send the code to a sandboxed execution engine, most likely self-hosted Judge0.
4. The frontend polls `GET /jobs/:id` until the result arrives.

Day 1 builds step 1 only.

## 3. Scope

### In scope

- Foundation: validated config, Docker Compose for Postgres, a production Dockerfile, a health check, one error format, OpenAPI docs, security headers, CORS, and CI.
- Module boundaries, enforced by dependency-cruiser.
- The `problems` module: two tables, migrations, a seed script, and `GET /problems/:slug`.
- Nine automated tests (section 9).
- Stale-proof docs: README, `.env.example`, decision notes, and `CLAUDE.md`.
- Removal of scaffold leftovers: the sample `cat` module, the stale e2e test, the `@nestjs/mau` dependency with its `deploy` script, and the stock README.

### Out of scope

| Item | Arrives |
|---|---|
| Submit endpoint, jobs table, queue, workers, polling | submissions day |
| Queue technology (BullMQ or Kafka) | submissions day |
| Judge0 integration and its language-ID mapping | execution day |
| Problem list endpoint and cursor pagination | when the frontend needs a list |
| Auth, rate limiting | when users exist |
| pino logging, metrics, Sentry | when a deployment exists to observe |
| Git hooks, commitlint, release tooling, CD | with a second contributor or the first deployment |
| `/api` prefix, URL versioning, caching headers | when a concrete need appears |

## 4. Architecture

### 4.1 Style: modular monolith

The app is one deployable Nest application split into business modules. Each module owns its tables and exposes a small public API, and other modules use only that API. Shared infrastructure lives in `platform/` and holds no business rules.

The rules:

1. Only a module's own repository queries its tables.
2. Code outside a module imports it only through its `index.ts` and uses only the providers its Nest module exports.
3. Dependencies point one way: modules depend on platform, and platform never depends on modules.
4. Imports never form a cycle.

The rules cover `src/` only. Tests may import module internals to set up fixtures.

### 4.2 Request flow

```
GET /problems/two-sum
  → ProblemsController   validates the slug; HTTP concerns only
  → ProblemsService      business rules: an unknown slug is a 404
  → ProblemsRepository   SQL; the only code that touches the problems tables
  → Postgres
  ← { data: ... }, passed through a response schema that drops undeclared fields
```

### 4.3 Layout

```
src/
  main.ts                      bootstrap; enables shutdown hooks; listens on PORT
  app.module.ts                root module; registers global pipe, filter, serializer
  app.setup.ts                 helmet, CORS, Swagger; shared by main.ts and e2e tests
  platform/
    config/env.schema.ts       Zod schema for env vars
    database/                  DrizzleModule registration; Database type
    errors/                    Problem Details mapping and exception filter
    health/                    GET /health (Terminus)
  modules/
    problems/
      index.ts                 public API: exports ProblemsModule
      problems.module.ts       exports no providers yet
      problems.controller.ts
      problems.service.ts
      problems.repository.ts
      problems.tables.ts       Drizzle tables owned by this module
      problems.dto.ts          Zod request and response schemas
      problems.seed.ts         development seed
drizzle/                       generated SQL migrations, committed
test/
  setup/                       Testcontainers global setup
  support/                     app factory, fixtures, table reset
  architecture/                dependency-cruiser rule test and its fixture tree
  *.e2e-spec.ts
docs/
  decisions/                   dated decision notes
  superpowers/specs/           design specs
.github/workflows/ci.yml
.dependency-cruiser.cjs
docker-compose.yml
Dockerfile, .dockerignore
drizzle.config.ts
.env.example, .nvmrc
CLAUDE.md, README.md
```

"Schema" means two things here, so file names keep them apart: `*.tables.ts` holds Drizzle table definitions and `*.dto.ts` holds Zod schemas.

### 4.4 Boundary enforcement

dependency-cruiser checks the rules in 4.1 on every `npm run lint`. It resolves real file paths, so one rule covers every module at any folder depth. A capture group expresses "another module": a file in `src/modules/<m>/` may import from another module only at `src/modules/*/index.ts`.

oxlint's `no-restricted-imports` lost to it because oxlint matches import strings, not resolved files. A scratch test on 2026-10-26 showed the string approach raising false alarms and missing violations once a module has subfolders.

dependency-cruiser 18.7.0 supports TypeScript below 7 only. With an incompatible compiler, it checks zero files and reports success. The project stays on TypeScript 6, which Nest 12's CLI also requires, and test 7 fails if the rules ever stop firing.

### 4.5 Wiring shared by production and tests

`AppModule` registers the validation pipe, exception filter, and response serializer through Nest's `APP_PIPE`, `APP_FILTER`, and `APP_INTERCEPTOR` tokens. `app.setup.ts` applies helmet, CORS, and Swagger. Both `main.ts` and the e2e tests build the app from `AppModule` plus `app.setup.ts`, so tests exercise the production wiring. Only `main.ts` enables shutdown hooks and listens on a port.

## 5. Data model

### 5.1 Tables

Both tables belong to the `problems` module and live in `problems.tables.ts`.

`problems`

| Column | Type | Constraints and notes |
|---|---|---|
| id | integer | primary key, `GENERATED ALWAYS AS IDENTITY`; internal, never in URLs or responses |
| slug | text | not null, unique; check: matches `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 100 characters |
| title | text | not null |
| description | text | not null; Markdown |
| difficulty | enum `difficulty` (`easy`, `medium`, `hard`) | not null |
| created_at | timestamptz | not null, default `now()` |
| updated_at | timestamptz | not null, default `now()`; the app sets it on updates |

`problem_languages` holds one row per language offered for a problem.

| Column | Type | Constraints and notes |
|---|---|---|
| problem_id | integer | not null; references `problems.id`, on delete cascade |
| language | enum `language` (`javascript`, `python`) | not null |
| starter_code | text | not null; public |
| reference_solution | text | not null; secret, never returned by the API |

Primary key: `(problem_id, language)`.

### 5.2 Indexes

The unique constraint on `slug` serves slug lookups. The composite primary key starts with `problem_id`, so it serves "all languages for a problem". No other indexes.

### 5.3 Choices

- Integer `id` plus unique `slug`. UUIDs suit user-owned records such as jobs, whose IDs should be unguessable; public problems gain nothing from them. A slug primary key would cascade through foreign keys on every rename. The ordered integer `id` also serves as a future pagination cursor.
- Postgres enums for `language` and `difficulty`. The database rejects unknown values, and Drizzle derives TypeScript unions that the Zod schemas reuse. Adding a value takes a one-line migration. A `languages` table becomes worthwhile once languages carry user-visible data such as version labels. Judge0's language IDs belong to the future execution module, not here.
- `drizzle-orm` and `drizzle-kit` pinned to exactly `1.0.0-rc.5`. Drizzle's own docs and Nest's Drizzle guide both target the 1.0 RC, and setup matches 0.45 because `@nestjs/drizzle` supports both. The exact pin keeps a new RC from arriving unannounced.
- Driver `pg` (node-postgres), integrated through `@nestjs/drizzle` 0.0.2 with `forRootAsync` and `ConfigService`.

### 5.4 Migrations

`drizzle-kit generate` writes SQL migration files into `drizzle/`, which we review and commit. `drizzle-kit migrate` applies them. We never use `drizzle-kit push`, which changes the schema without leaving history. Migrations run as an explicit command, never at app startup, because concurrent instances would race.

### 5.5 Seed

`npm run db:seed` loads Two Sum and Valid Parentheses, each in JavaScript and Python, with starter code and a working reference solution. It upserts on `slug` and on `(problem_id, language)`, so a repeated run updates rows instead of duplicating them. The seed serves development only: tests insert their own rows, and real problems will arrive through a future admin path.

### 5.6 Read path

The repository runs two indexed queries and selects public columns only:

1. `problems` by `slug`.
2. `problem_languages` by `problem_id`, ordered by `language`, which sorts in enum declaration order.

It never selects `reference_solution` on this path.

## 6. API contract

### 6.1 Endpoint

`GET /problems/:slug`

The slug must match `^[a-z0-9]+(-[a-z0-9]+)*$` and hold at most 100 characters; anything else gets a 400. Validation runs through `@Param('slug', { schema })` and Nest's `StandardSchemaValidationPipe`.

### 6.2 Success responses

Every success response uses the envelope `{ data, meta? }`. `meta` appears only when it carries something, and list endpoints will always carry pagination there. Wrapping an existing endpoint later would break clients, so the envelope starts on day 1.

`200 OK` for `GET /problems/two-sum`:

```json
{
  "data": {
    "slug": "two-sum",
    "title": "Two Sum",
    "difficulty": "easy",
    "description": "Given an array of integers `nums` and an integer `target`...",
    "languages": [
      { "language": "javascript", "starterCode": "function twoSum(nums, target) {\n\n}" },
      { "language": "python", "starterCode": "class Solution:\n    def twoSum(self, nums, target):\n        " }
    ]
  }
}
```

The response omits `id`, the timestamps, and `referenceSolution`. Adding a field later breaks nothing, while removing one breaks the frontend, so the contract starts minimal.

Future list endpoints use the same envelope:

```json
{
  "data": [{ "slug": "two-sum", "title": "Two Sum", "difficulty": "easy" }],
  "meta": { "nextCursor": "eyJpZCI6Mn0", "hasMore": true }
}
```

### 6.3 One schema per shape

One Zod schema per shape does three jobs:

- It validates requests, through `StandardSchemaValidationPipe`.
- It allow-lists responses, through `StandardSchemaSerializerInterceptor` and `@SerializeOptions({ schema })`. The serializer drops undeclared fields, and a response that fails the schema becomes a logged 500.
- It generates the OpenAPI docs, through `@nestjs/swagger`'s native Standard Schema support: `@Param` schemas are read automatically, and responses declare `@ApiOkResponse({ standardSchema })`.

Controllers return the envelope explicitly, and the response schema describes the whole envelope, so the docs, the allow-list, and the wire format agree. TypeScript types come from the schemas through `z.infer`.

### 6.4 Keeping the reference solution secret

1. The repository never selects `reference_solution` on the read path.
2. The response schema has no such field, so the serializer drops it if it ever appears.
3. Test 2 asserts that the solution text never appears in a response.

### 6.5 Errors

Every error uses RFC 9457 Problem Details, with content type `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed.",
  "instance": "/problems/Two_Sum",
  "errors": [{ "path": "slug", "message": "Use lowercase letters, digits, and single hyphens." }]
}
```

- `title` holds the HTTP reason phrase and `instance` the request path.
- A 400 adds `errors`, built from the schema's validation issues.
- An unknown slug returns 404 with `detail` set to `Problem 'two-summ' was not found.` and no `errors`.
- An unexpected error returns 500 with `detail` set to `An unexpected error occurred.` The real error and its stack trace go to the server log only.
- Unmatched routes return the same 404 shape.

Errors stay outside the `{ data, meta }` envelope. Clients tell them apart by status code and content type.

### 6.6 Other endpoints

- `GET /health` (section 7.4) sits outside the envelope and the API docs.
- Swagger UI lives at `/docs` and the raw spec at `/docs-json`; both are off when `NODE_ENV=production`. The frontend can later generate TypeScript types from the raw spec.

## 7. Foundations

### 7.1 Configuration

`@nestjs/config` validates environment variables against a Zod schema (`validationSchema`) at startup. If any variable fails, the app refuses to boot and lists every failure.

| Variable | Rule | Default |
|---|---|---|
| `NODE_ENV` | `development`, `test`, or `production` | `development` |
| `PORT` | integer from 1 to 65535 | `3000` |
| `DATABASE_URL` | required; a `postgres://` or `postgresql://` URL | none |
| `CORS_ORIGINS` | comma-separated origins | `http://localhost:5173`, Vite's dev port |

`.env.example` documents every variable. `.env` holds local values and stays out of git.

### 7.2 Local infrastructure

`docker-compose.yml` defines two services:

- `db`: `postgres:18-alpine` on port 5432, with a `pg_isready` healthcheck and a named volume. The image keeps its data in `/var/lib/postgresql/18/docker`, so the volume mounts at `/var/lib/postgresql`. Tests and CI use the same image tag.
- `app`: the production image, behind the `app` profile. `docker compose up` starts only `db`, and `docker compose --profile app up` adds the app, which reaches the database at hostname `db`.

Day-to-day development runs the app on the host with `npm run start:dev`, for fast reloads, F5 debugging, and a single `node_modules`. The installed toolchain includes macOS-only native binaries (oxlint, its type checker, and Vite's bundler), so a Linux container cannot reuse the host's `node_modules`.

### 7.3 Dockerfile

A multi-stage build on a Node 26 base installs dependencies, compiles with `nest build`, and copies `dist/` plus production dependencies into a runtime stage. That stage runs `node dist/main.js` as a non-root user. `.dockerignore` excludes `node_modules`, `dist`, `.env`, `.git`, and `coverage`.

### 7.4 Health check

`GET /health` uses `@nestjs/terminus` with a custom Drizzle indicator that runs `SELECT 1`. It returns 200 while the database answers and 503 otherwise. The Problem Details filter must leave Terminus's response format intact, including on 503. A Redis check on queue day adds one line.

### 7.5 HTTP hardening and shutdown

- `helmet` sets security headers. Outside production, its Content Security Policy drops `upgrade-insecure-requests`, because Safari applies it even to `http://localhost` and Swagger UI would fail to load.
- CORS admits only the origins in `CORS_ORIGINS`.
- `main.ts` calls `enableShutdownHooks()`, so a stop signal lets in-flight requests finish and `@nestjs/drizzle` closes the pool.

### 7.6 Logging

All code logs through Nest's built-in `Logger`, and the oxlint `no-console` rule enforces it. A later switch to pino then touches only the bootstrap.

### 7.7 Dependencies and scripts

New runtime dependencies: `@nestjs/config`, `@nestjs/drizzle` (0.0.2), `drizzle-orm` (exactly `1.0.0-rc.5`), `pg`, `zod`, `@nestjs/swagger`, `@nestjs/terminus`, `helmet`.

New dev dependencies: `drizzle-kit` (exactly `1.0.0-rc.5`), `@types/pg`, `@testcontainers/postgresql`, `dependency-cruiser`, `tsx`.

Removed: `@nestjs/mau` and the `deploy` script.

| Script | Runs |
|---|---|
| `lint` | `lint:code`, then `lint:arch` |
| `lint:code` | `oxlint --type-aware src/ test/` |
| `lint:arch` | dependency-cruiser on `src/` |
| `typecheck` | `tsc --noEmit` |
| `test` | unit tests (Vitest) |
| `test:e2e` | e2e tests (Vitest with Testcontainers) |
| `build` | `nest build` |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `drizzle-kit migrate` |
| `db:seed` | `tsx src/modules/problems/problems.seed.ts` |
| `arch:graph` | the module graph from dependency-cruiser, as Mermaid |

`.nvmrc` and the `engines` field in `package.json` pin Node to 26.

## 8. CI

`.github/workflows/ci.yml` runs on every push and pull request. GitHub supplies a fresh Ubuntu runner for each run, and the workflow needs no secrets.

Part 1 runs directly on the runner:

1. Check out the commit.
2. Install Node from `.nvmrc`, with npm caching.
3. `npm ci`
4. `npm run lint`: oxlint, then dependency-cruiser.
5. `npm run typecheck`
6. `npm test`
7. `npm run test:e2e`: Testcontainers starts Postgres 18 on the runner's Docker.
8. `npm run build`

Part 2 is the smoke test:

9. `docker compose --profile app up --build --wait`, then `GET http://localhost:3000/health` must return 200, then `docker compose --profile app down -v`.

Steps run cheapest first, and the run stops at the first failure. CI deploys nothing and pushes no image. A failure marks the commit red; success marks it green.

## 9. Testing

### 9.1 Approach

Tests check behavior through HTTP against a real Postgres instead of testing functions in isolation with mocks, because mocks of Drizzle's chained query builder break whenever a query changes. Unit tests cover pure logic only. Each test is written before the code it covers and seen to fail first.

A scratch test on 2026-10-26 confirmed that Vitest 4 in this scaffold handles Nest constructor injection without the SWC plugin.

### 9.2 E2E harness

- A Vitest global setup starts one `postgres:18-alpine` container per run with `@testcontainers/postgresql`, applies the migrations in `drizzle/`, and hands the connection URL to the tests.
- Each e2e file boots the real `AppModule` through `app.setup.ts`.
- Each test truncates the tables and inserts the rows it needs through fixture helpers.
- E2E files run one at a time (`fileParallelism: false`) because they share one database.

### 9.3 Test list

| # | Kind | Checks |
|---|---|---|
| 1 | e2e | a known slug returns `{ data }` with every offered language, in order |
| 2 | e2e | the reference solution never appears anywhere in the response |
| 3 | e2e | an unknown slug returns a 404 Problem Details body |
| 4 | e2e | a malformed slug returns a 400 Problem Details body with `errors` |
| 5 | e2e | `/health` returns 200 while the database is up |
| 6 | unit | the env schema rejects a missing or invalid `DATABASE_URL` and names it |
| 7 | check | dependency-cruiser reports planted violations of every boundary rule and cruises a non-zero number of files |
| 8 | unit | the slug schema accepts and rejects the right shapes |
| 9 | unit | an unexpected error maps to a generic 500 body with no internal details |

Test 7 runs the real `.dependency-cruiser.cjs` against a fixture tree in `test/architecture/fixtures/`.

The implementation plan adds five supporting e2e checks: `/health` keeps Terminus's body on 503, helmet sends security headers, CORS admits the configured origin and rejects others, and the OpenAPI document lists `GET /problems/{slug}` but not `/health`.

## 10. Documentation

Day 1 writes only documentation that stays true as the code changes:

- `README.md`: purpose, prerequisites (Node 26 and Docker), run and test commands, and where the API docs live.
- `.env.example`.
- OpenAPI, generated from the Zod schemas.
- `docs/decisions/`: short notes covering the decisions in section 11, grouped by topic. Each note states the context, the options, the decision, the trade-off accepted, and when to revisit.
- `CLAUDE.md`: conventions for Claude Code sessions, namely `.js` suffixes on relative imports, the module boundary rules, one Zod schema per shape, explicit column lists for API reads, tests first through HTTP, comments that explain why, `Logger` instead of `console`, and a decision note for each significant choice.

Code comments explain why, never what.

Full documentation in the style of prod-forge arrives at three triggers:

| Trigger | Document |
|---|---|
| submit → queue → worker works end to end | architecture overview |
| the first deployment | runbook covering deploy, rollback, and migrations |
| a second contributor joins | contributing guide |

## 11. Decision log

| # | Decision | Chosen | Alternatives | Reason |
|---|---|---|---|---|
| 1 | Day 1 scope | skeleton plus cheap-now foundations | bare skeleton; full prod-forge parity | small now, expensive to retrofit |
| 2 | Architecture | modular monolith | layered monolith | boundaries without network calls |
| 3 | Boundary enforcement | dependency-cruiser | oxlint `no-restricted-imports` | resolves real paths at any depth |
| 4 | Drizzle version | `1.0.0-rc.5`, exact pin | 0.45.4 stable | official docs target the RC; identical setup |
| 5 | Identifiers | integer `id` plus `slug` | UUID; slug as primary key | public data, cheap renames, cursor-friendly |
| 6 | Language list | Postgres enum | `languages` table | compile-time types; no per-language data yet |
| 7 | Test approach | HTTP behavior tests on real Postgres | layered tests with mocks | they survive refactors |
| 8 | Test database | Testcontainers | Compose test database; PGlite | fresh, and identical locally and in CI |
| 9 | Response shape | `{ data, meta? }` envelope | bare resource | room for cursor pagination without breaking clients |
| 10 | Error format | RFC 9457 Problem Details | Nest default; custom envelope | one standard, parseable shape |
| 11 | Validation | Zod through Nest's Standard Schema support | class-validator | one schema validates, serializes, and documents |
| 12 | Docs policy | stale-proof now, full docs at triggers | full docs now; almost none | drifting docs mislead |
| 13 | Containers | host development plus a production Dockerfile | development inside containers | fast reloads; macOS-native binaries |
| 14 | CI shape | runner checks plus a Compose smoke test | everything in Compose; image built but never run | fast feedback, and proof the real image boots |
| 15 | Postgres version | 18 | 17 | native `uuidv7()` for future job IDs |
| 16 | Health check | Terminus | hand-written controller | standard format; a Redis check is one line later |

## 12. Risks

| Risk | Mitigation |
|---|---|
| `@nestjs/drizzle` is at version 0.0.2 | keep its use thin (`forRootAsync`, `@InjectDrizzle()`); a small custom provider can replace it |
| Drizzle changes between RCs | exact version pin; upgrade deliberately |
| dependency-cruiser passes silently under TypeScript 7 | stay on TypeScript 6; test 7 fails if the rules stop firing |
| e2e tests need Docker running | the README says so; Docker Desktop is installed |
| the `CORS_ORIGINS` default guesses the frontend's port | override it in `.env` |
| Judge0 v1.13.1 needs a Linux host switched to cgroup v1 | evaluate on execution day; plan a Linux VM, not the Mac |

## 13. Notes for later sessions

- Submit should return `202 Accepted` with the job ID, since the work is queued, not finished. `201 Created` fits only if the job itself counts as the created resource.
- Saving a job and enqueuing it must not lose either one (the dual-write problem). Evaluate `@nestjs/outbox` (0.1.3) and `@nestjs/idempotency` (0.0.2).
- Judge0 runs its own queue and workers. Decide what the app's queue adds: retries, backpressure, and job records.
- An `execution` module hides Judge0 behind an interface so the engine can change.
- Jobs get UUIDv7 IDs, generated by Postgres 18.

## Appendix: verified facts

| Fact | Checked | Source |
|---|---|---|
| `@nestjs/common` 12.2.0 exports `StandardSchemaValidationPipe` and `StandardSchemaSerializerInterceptor`, and `@Param(property, { schema })` exists | 2026-10-26 | installed package typings |
| `@nestjs/swagger` 12.0.4 converts Standard Schema to OpenAPI, reads `@Param` schemas, and serves the raw spec at `<path>-json` | 2026-10-26 | package typings and source |
| `@nestjs/config` 12 accepts Standard Schema in `validationSchema` | 2026-10-26 | docs.nestjs.com |
| `@nestjs/drizzle` 0.0.2 calls the driver's `drizzle()` with the connection options; its peer range covers Drizzle 0.35+ and 1.0 | 2026-10-27 | package source |
| Drizzle `latest` is 0.45.4 (2026-10-08) and `rc` is 1.0.0-rc.5 (2026-10-21); Drizzle's docs install `@rc` | 2026-10-27 | npm registry, Drizzle docs |
| Vitest 4 with Vite 8 supports Nest constructor injection without SWC | 2026-10-26 | scratch test |
| oxlint 1.89 matches import strings and misjudges imports inside module subfolders | 2026-10-26 | scratch test |
| dependency-cruiser 18.7.0 resolves `.js` specifiers to `.ts` files, supports `$1` capture groups, and requires TypeScript below 7 | 2026-10-26 | scratch test |
| `postgres:18-alpine` runs PostgreSQL 18.6, stores data in `/var/lib/postgresql/18/docker`, and supports `uuidv7()` | 2026-10-27 | container test |
| Judge0's latest release is v1.13.1 (2024-04-18); it is tested on Linux only, and Ubuntu 22.04 needs `systemd.unified_cgroup_hierarchy=0` | 2026-10-27 | Judge0 CHANGELOG |
