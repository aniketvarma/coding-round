# ai-mock-interview

A LeetCode-style practice platform: users read a problem, submit code, and poll for the result. The backend is NestJS 12 (ESM) with Drizzle ORM on PostgreSQL 18, tested with Vitest, linted with oxlint, and boundary-checked with dependency-cruiser.

## Start here

- Design spec, the what and why: `docs/superpowers/specs/2026-10-27-day-1-problems-api-design.md`
- Implementation plan, the how, task by task: `docs/superpowers/plans/2026-10-27-day-1-problems-api.md`
- Decisions: section 11 of the spec, and `docs/decisions/` once written

Read the relevant spec section before changing behavior. Settled decisions reopen only for a new reason.

## Commands

Some of these exist only after their plan task is done.

- `docker compose up -d`: start Postgres
- `npm run start:dev`: run the API with reload
- `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`: schema and data
- `npm run lint`: oxlint, then the dependency-cruiser boundary check
- `npm run typecheck`, `npm test`, `npm run test:e2e` (e2e needs Docker running)

## Conventions

- ESM: relative imports end in `.js`, even though the files are `.ts`.
- Modular monolith: business code lives in `src/modules/<name>/`, shared infrastructure in `src/platform/`.
  - Only a module's own repository queries its tables (`<name>.tables.ts`).
  - Code outside a module imports it only through its `index.ts`.
  - Platform never imports modules, and imports never form a cycle. dependency-cruiser enforces all of this.
- Inside a module: the controller handles HTTP, the service holds the rules, and the repository holds the SQL.
- One Zod schema per shape, in `<name>.dto.ts`, validates requests, allow-lists responses, and generates the OpenAPI docs.
- Success responses use `{ data, meta? }`. Errors use RFC 9457 Problem Details (`application/problem+json`).
- API reads select explicit columns and never select secret columns such as `reference_solution`.
- Migrations: `drizzle-kit generate`, then `drizzle-kit migrate`. Never use `drizzle-kit push`. Commit the SQL in `drizzle/`.
- Pinned versions: `drizzle-orm` and `drizzle-kit` exactly `1.0.0-rc.5`; TypeScript 6, because dependency-cruiser needs a version below 7; Node 26.
- Log with Nest's `Logger`; `console` is a lint error.
- Tests check behavior through HTTP against a real Postgres (Testcontainers). Unit tests cover pure logic only. Write each test first and watch it fail.
- Comments explain why, never what.
- Record each significant decision as a short note in `docs/decisions/`.

## Collaboration

- Before recommending a tool or design choice, lay out the options with their trade-offs. Define jargon in plain words.
