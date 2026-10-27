# GeoLabel private memory and authentication

This branch is intentionally local-only and is not deployed or pushed. Persistent user/client routes require a non-anonymous Firebase ID token. The backend verifies Firebase public signing certificates through `google-auth`, including issuer, audience (`FIREBASE_PROJECT_ID`), expiry, and `sub`. Anonymous identities are rejected. User tasks and memory are filtered by the verified UID on every read and mutation.

`POST /annotators/register` and `/tasks/{id}/simulate-completion` are admin-only. Admin access requires a non-empty `GEOLABEL_ADMIN_SECRET` supplied in `X-GeoLabel-Admin-Secret`, or a verified Firebase custom admin claim (`admin: true`, `role: admin`, or `roles` containing `admin`). No public registration or empty-secret fail-open path exists. Legacy annotator API keys remain hash-only and are accepted only for annotation submission; issue them through the admin route.

Production startup fails closed unless `DATABASE_URL` is set to durable PostgreSQL. SQLite is permitted only with explicit `APP_ENV=local|dev|development|test`, including local tests. Run `migrations/001_owner_uid_user_memory.sql` on the durable database, and manually assign every pre-existing task to a verified Firebase UID before enforcing `NOT NULL`; do not auto-import anonymous browser data.

## Required configuration

Copy `.env.example`, set `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `GEOLABEL_ADMIN_SECRET` (unless claims are used), `CORS_ORIGINS`, and `APP_ENV=production`. A PostgreSQL driver such as `psycopg[binary]` must be added to the runtime image when using `postgresql+psycopg`.

The shared parent SDK is not included or copied here. The frontend `memory-config.js` is the integration contract to be supplied by the parent serving root. Persistent UI records must be written through that authenticated client; no legacy localStorage records are imported, deleted, or reported as successfully saved. Raw imagery is not uploaded or stored by this branch.

Remaining blockers: a Firebase project/public auth configuration must be provisioned by the account owner; a durable Neon/Postgres database and migration execution are required; serving-root bootstrap wiring and the final API base URL remain parent tasks; admin custom claims or secret issuance must be decided securely; backups, monitoring, CORS origin, and production deployment review remain outstanding. No paid providers, marketplace, charges, live writes, deployment, or secret values are included.
