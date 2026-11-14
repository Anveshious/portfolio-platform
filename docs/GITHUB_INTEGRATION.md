# GitHub integration

## Permissions
- **Login:** OAuth scope `read:user` only.
- **Discovery:** public repositories via GitHub's unauthenticated API (60 req/h) or an optional **fine-grained PAT with no extra permissions** in `GITHUB_API_TOKEN` (5000 req/h). Private repositories are never requested and are rejected if ever returned.
- The owner's login is resolved from `ADMIN_GITHUB_ID` (`GET /user/{id}`), so renames don't break sync.

## Sync flow
`runSync`: resolve login → list public repos → compare content hash with stored → for new/changed repos fetch README + languages → insert (`discovered`) / update → flag vanished repos `missing` → write a `github_sync_runs` row. Safety valve: an empty listing with known repos is reported as `partial` and does not mass-flag. Sync only touches `github_repositories`.

Triggers: `POST /api/admin/github/sync` (`initial`/`manual`), webhook (`webhook`), daily cron (`scheduled`).

## Webhook setup (per repository or organisation/account-level where available)
Webhook creation is **not automatic**; the platform only receives events. For each repo (Settings → Webhooks) or your account-level setup:
- Payload URL `https://<site>/api/webhooks/github`, content type `application/json`
- Secret = `GITHUB_WEBHOOK_SECRET`
- Events: Push, Repositories, Stars/Watches, Forks, Releases (optional)
Repository webhooks require admin rights on that repo. Without webhooks, the daily cron still reconciles (up to 24 h lag). Invalid signatures get 401 and are logged to server logs only (not stored). Redeliveries are detected via the unique delivery ID and answered 200 `duplicate`.

## Not done yet
Contribution graph/recent activity beyond pushes (needs GraphQL + a token), automatic webhook creation, LinkedIn API (manual `social_links.highlight` content is the supported path).
