# CHIKONDI265 API: Dokploy Upload

This archive is an API-only source bundle for Dokploy. It does not deploy itself or change the existing service.

## Upload and service settings

1. In Dokploy, create an **Application** and choose the ZIP upload provider. Do not create a Docker Compose project for this archive.
2. Upload `CHIKONDI265-Dokploy.zip`. Its root contains `Dockerfile`; use the root as the build context and `Dockerfile` as the Dockerfile path.
3. Expose container port `8080`. The server binds to `0.0.0.0` and uses `PORT` (default `8080`).
4. Map the application domain to `chikondi.ddns.net` and enable HTTPS in Dokploy if DNS already points to that server. This package does not change DNS or the currently running domain.

## Required environment

Set these values in Dokploy's environment settings. Keep connection strings and credentials out of the ZIP and source control.

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string reachable from the API container |
| `NODE_ENV` | Recommended | `production` |
| `PORT` | Recommended | `8080` |
| `LOG_LEVEL` | Optional | `info` |
| `CORS_ORIGINS` | Optional | Comma-separated browser frontend origins only |

The intended public API base URL is `https://chikondi.ddns.net`. It is the API host, not a browser frontend origin; do not add it to `CORS_ORIGINS` unless a browser app is actually served from that same origin. Native mobile clients do not require CORS.

## Health checks

- `GET https://chikondi.ddns.net/api/healthz` — process liveness; expected HTTP 200 with `{"status":"ok"}`.
- `GET https://chikondi.ddns.net/api/readyz` — database connectivity via `SELECT 1`; expected HTTP 200 with `{"status":"ready"}` only when `DATABASE_URL` is reachable.

Readiness does not validate application tables, authentication, matching, payments, or other signed-in flows. The Dockerfile health check uses `/api/readyz`, so an unreachable database will keep the container unhealthy.

## Database safety

The container does not run migrations automatically. Before testing authenticated or data-backed routes, confirm that `DATABASE_URL` points to the intended test database and that its application schema is present. Do not run migrations against production without verifying the target, confirming a recoverable backup, and obtaining explicit approval.

## Verification and limits

The API TypeScript check, production bundle build, eight focused API tests, and Argon2 runtime import were verified in the workspace. A Docker image build could not be run there because the Docker daemon is unavailable. The ZIP is checked for archive integrity and required build-context files, but still needs to be uploaded and built by Dokploy before the container image itself is verified.
