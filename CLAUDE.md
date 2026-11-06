# ai-mock-interview

A LeetCode-style practice platform: users read a problem, submit code, and poll for the result. The backend is NestJS 12 (ESM) on PostgreSQL 18, with raw SQL through postgres.js and plain-SQL migrations run by dbmate. It's tested with Vitest, linted with oxlint, and boundary-checked with dependency-cruiser.

## Start here

- Design spec, the what and why: `docs/superpowers/specs/2026-10-27-day-1-problems-api-design.md`
- Implementation plan, the how, task by task: `docs/superpowers/plans/2026-10-27-day-1-problems-api.md`
- Decisions: section 11 of the spec, and `docs/decisions/`

Read the relevant spec section before changing behavior. Settled decisions reopen only for a new reason.

The spec and plan still describe Drizzle. The data layer has since moved to dbmate, postgres.js, and SafeQL (`docs/decisions/0003-data-layer.md`), so adapt the plan's Drizzle code in Tasks 4 to 9 instead of following it literally. The plan is left unchanged on purpose.

## Commands

Some of these exist only after their plan task is done.

- `docker compose up -d`: start Postgres
- `npm run start:dev`: run the API with reload
- `npm run db:migrate`: apply pending migrations
- `npx dbmate -d src/modules/<module>/migrations new <name>`: create a migration in a module
- `npm run db:seed`: load development data
- `npm run lint`: oxlint, then the dependency-cruiser boundary check
- `npm run typecheck`, `npm test`, `npm run test:e2e` (e2e needs Docker running)

## Conventions

- ESM: relative imports end in `.js`, even though the files are `.ts`.
- Modular monolith: business code lives in `src/modules/<name>/`, shared infrastructure in `src/platform/`.
  - Each module owns its tables, created by the migrations in its own `migrations/` folder, and only its repository queries them.
  - Code outside a module imports it only through its `index.ts`.
  - Platform never imports modules, and imports never form a cycle. dependency-cruiser enforces all of this.
- Inside a module: the controller handles HTTP, the service holds the rules, and the repository holds the SQL.
- One Zod schema per shape, in `<name>.dto.ts`, validates requests, allow-lists responses, and generates the OpenAPI docs.
- Success responses use `{ data, meta? }`. Errors are planned as RFC 9457 Problem Details (`application/problem+json`), but that work is deferred, so Nest's default error body applies until then.
- Queries are raw SQL in postgres.js `sql` templates, which send values as parameters. Never build SQL by joining strings. SafeQL checks queries against the dev database once it's set up (plan Task 7).
- API reads select explicit columns and never select secret columns such as `reference_solution`.
- Migrations are plain SQL files run by dbmate, with `-- migrate:up` and `-- migrate:down` sections. Never edit a migration that has already run; write a new one. Add each new module's `migrations/` folder to the `db:migrate` script with another `-d`.
- Locally, `DATABASE_URL` ends in `?sslmode=disable`, because dbmate requires TLS by default and the Docker database has none. `db:migrate` passes `--no-dump-schema` because the dump needs a `pg_dump` at least as new as Postgres 18, and the local one is older.
- `UPDATE` statements set `updated_at = now()` themselves; no trigger does it.
- Pinned versions: postgres.js stays on v3 until v4 has settled; TypeScript 6, because dependency-cruiser needs a version below 7; Node 26.
- Log with Nest's `Logger`; `console` is a lint error.
- Tests check behavior through HTTP against a real Postgres (Testcontainers). Unit tests cover pure logic only. Write each test first and watch it fail.
- Comments explain why, never what.
- Record each significant decision as a short note in `docs/decisions/`.

## Collaboration

- Before recommending a tool or design choice, lay out the options with their trade-offs. Define jargon in plain words.
