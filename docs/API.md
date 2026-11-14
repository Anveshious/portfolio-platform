# API reference

Envelope: success `{ "ok": true, "data": ..., "meta"?: ... }`; failure `{ "ok": false, "error": { "code", "message", "details"? } }`. JSON fields are snake_case.

## Public (GET only, no auth, cached 60 s)
`/api/public/profile` · `skills` · `projects` · `projects/featured` · `projects/active` (in_progress) · `projects/[slug]` · `achievements` · `experiences` · `opportunities` · `socials` · `activity/github` (aggregates + recent pushes of published projects). Also `/api/health` (liveness).
Only published + public rows are returned; unknown or hidden slug → 404.

## Admin (401 unauthenticated, 403 not the owner)
| Method & path | Purpose |
|---|---|
| GET/POST `/api/admin/projects` | list (`?publication_state=&development_status=`) / create (always a hidden draft) |
| GET/PATCH/DELETE `/api/admin/projects/[id]` | read / edit owner fields + `technologies` / delete |
| POST `/api/admin/projects/[id]/publication` | `{action:"publish"\|"unpublish"}` (publish needs title, slug, owner short description) |
| POST `/api/admin/projects/[id]/feature` | `{featured:boolean}` |
| PUT `/api/admin/projects/order` | `{items:[{id,display_order}]}` → 204 |
| POST/DELETE `/api/admin/projects/[id]/media` | attach `{media_asset_id, role, caption?}` / detach `{project_media_id}` |
| POST `/api/admin/github/sync` | `{mode:"initial"\|"manual"}` → sync summary |
| GET `/api/admin/github/repositories` | discovered repos (`?status=`) |
| POST `/api/admin/github/repositories/[id]/import` | create draft project (optional `title`, `slug`, `category`) |
| GET `/api/admin/github/sync-runs` | last 50 runs |
| GET/PUT `/api/admin/profile` | singleton profile |
| GET/POST `/api/admin/content/[resource]`, PATCH/DELETE `.../[id]` | resource ∈ skills, achievements, experiences, opportunities, socials, activities |
| GET/POST `/api/admin/media`, GET/DELETE `/api/admin/media/[id]` | multipart upload (`file`, `kind`, `alt_text`) |
| GET `/api/admin/system/status` | DB connectivity, GitHub rate limit, last sync, config flags |

## Machine endpoints
`POST /api/webhooks/github` (HMAC), `GET /api/cron/github-sync` (Bearer `CRON_SECRET`).

## Auth routes
`GET /auth/login`, `GET /auth/callback`, `POST /auth/signout`.
