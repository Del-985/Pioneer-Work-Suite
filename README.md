# Pioneer Work Suite

Pioneer Work Suite is a local-first productivity workspace with optional cloud
synchronization. Version 0.1.19 preserves that foundation while reducing frontend maintenance risk:

- shared, regression-tested offline queue and version-conflict retry mechanics for Tasks, Documents, and Calendar;
- focused Documents library/workspace/find-replace modules, reusable Tasks and Dashboard components, and separated IndexedDB responsibilities;
- automated source-file maintainability budgets in CI to prevent new oversized modules.

Version 0.1.18 added the production backend foundation:
versioned records, replay-safe mutations, deletion tombstones, ordered cloud
change pulls, committed PostgreSQL migrations, and a Render Blueprint.

## Local backend

1. Copy `apps/api/.env.example` to `apps/api/.env` and set a PostgreSQL
   `DATABASE_URL` plus a development `JWT_SECRET`.
2. Install workspace dependencies with `pnpm install`.
3. Apply migrations with `pnpm --filter pioneer-student-api prisma:migrate:deploy`.
4. Start the API with `pnpm dev:api` and the web client with `pnpm dev:web`.

Development web builds default to `http://localhost:4000`. Override the API
endpoint with `VITE_API_BASE_URL` when building for another environment.

## Backend validation

```text
pnpm --filter pioneer-student-api test
pnpm --filter pioneer-student-api build
pnpm --filter pioneer-student-web build
```

The API tests cover HTTP safety behavior, ownership filtering, idempotent
retries, optimistic version conflicts, tombstone deletion, and incremental
sync cursors.

## Render deployment

`render.yaml` defines the Node web service, private PostgreSQL connectivity,
health check, generated JWT secret, build/start commands, and pre-deploy
migrations. The migration launcher safely recognizes an existing database that
was created with `prisma db push`, records the 0.1.17 baseline, and then applies
the 0.1.18 migration. New databases apply both migrations normally.

Production deployment still requires an active Render account and billing, but
no source changes are required before the Blueprint can be connected.

## Synchronization contract

- Clients attach an `Idempotency-Key` to retryable mutations.
- Updates include `ifVersion`; deletes use `If-Match`.
- Conflicts return `409` with `code: VERSION_CONFLICT` and the current entity.
- Deletes remain as tombstones so other devices can remove stale local copies.
- `GET /sync/changes?cursor=...` returns an ordered, user-scoped change feed.
