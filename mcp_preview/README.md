# GeoLabel remote MCP (Preview only)

This folder is the root of a separate Vercel project. It exposes only the MCP Streamable HTTP route at `/mcp`; it does not mount GeoLabel’s web app, API, database, or private Blob store. The existing `geo-label` project and its Vercel SSO settings are not changed.

## Access and data boundaries

- The endpoint requires `Authorization: Bearer <GEOLABEL_MCP_API_KEY>` on every `/mcp` request. The environment variable must be at least 32 characters; absent or weak keys fail closed with HTTP 503, and invalid keys receive HTTP 401.
- Store `GEOLABEL_MCP_API_KEY` only in the separate Vercel project’s **Preview** environment, scoped to branch `cue/geolabel-verified-workflows`. Never commit the key or put it in a URL.
- Vercel host validation allows only the active deployment/branch hosts and local loopback; browser origins are denied unless explicitly allowlisted with `GEOLABEL_MCP_ALLOWED_ORIGINS`.
- The server uses stateless JSON Streamable HTTP, a 2 MB tool-payload limit, bounded feature counts, and uncached responses. It processes only caller-supplied GeoJSON and does not persist it or access project records.
- `git.deploymentEnabled` permits the authorized feature branch and disables other branches, including `main`. Do not promote this Preview to Production.

## Connect

Use the active feature-branch Preview hostname with `/mcp` as the MCP URL and supply the bearer key in the client’s Authorization header. Vercel creates the final hostname after the first Preview deployment.

This private Preview uses a high-entropy static bearer key for client compatibility. It is not a full OAuth 2.1 authorization server. Before any public or Production release, replace this with a standards-compliant OAuth 2.1 flow and revisit deployment protection, key rotation, rate limits, and operational monitoring.

## Preview-only deployment guard

The Vercel project’s ignored-build command permits only `VERCEL_ENV=preview` on `cue/geolabel-verified-workflows`. The app also returns HTTP 503 in every other Vercel environment, even if a bearer key is accidentally supplied there. For API-driven deployments use Vercel’s explicit `staging` target (its Preview target); an omitted target on a new project can be auto-promoted by Vercel and must not be used.
