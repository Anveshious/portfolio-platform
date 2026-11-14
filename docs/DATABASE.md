# Database

Single migration: `supabase/migrations/20260101000000_initial_schema.sql` (add new files for changes; never edit one that has been applied).

## Tables
| Table | Purpose |
|---|---|
| admin_users | Owner identity anchored on `github_user_id` (bigint, unique); `user_id` auto-linked on first login by trigger `link_admin_user` |
| profiles | Singleton (unique index on `(true)`) |
| media_assets | Storage metadata (bucket, path, mime, size, alt, kind) |
| github_connections | Owner's GitHub account record (no tokens stored) |
| github_repositories | **GitHub-sourced** data; unique `github_repository_id`; `content_hash` for change detection; status `discovered/imported/ignored/missing` |
| projects | **Owner-authored** content; optional FK to a repository (`on delete set null`) |
| project_technologies, project_media | Child rows (`on delete cascade`); one thumbnail + one diagram per project |
| skills, achievements, experiences, opportunities, social_links, current_activities | Ordered content with `visibility` |
| github_sync_runs, github_webhook_events | Operational logs; `delivery_id` unique for idempotency |

## Key constraints
Slug regex + unique; published projects need a non-empty `short_description`; achievements public ⇒ verified; experience end ≥ start; URL scheme checks (http/https/mailto only); file size ≤ 10 MB; `published_at` stamped on first publish; `updated_at` triggers everywhere.

## Deletion behaviour
Deleting a project never deletes its repository (returns to `discovered` via the service). Deleting a repository leaves the project. Deleting a media asset nulls profile/achievement references and cascades `project_media`.

## RLS
RLS is on for all tables. `anon`/`authenticated` read policies expose only: published+public projects (and their technologies, media, linked repository row), `public` content rows, a public profile. Admin policies (`is_admin()` = auth uid present in `admin_users`) grant full access. `admin_users`, `github_connections`, `github_sync_runs`, `github_webhook_events` have no public policy. `public_github_summary()` is `SECURITY DEFINER` and returns aggregates only. Server code additionally uses the service role after an app-level admin check.

## Storage
Bucket `portfolio-media`: public read, admin-only write, 10 MB, mime allow-list (JPEG/PNG/WebP/AVIF/PDF; SVG excluded).

## Known limitation
Replacing a project's technologies is two statements (delete + insert), not one transaction. Acceptable for owner-only edits; move to an RPC if it matters.
