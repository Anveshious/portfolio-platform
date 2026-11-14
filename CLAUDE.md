# CLAUDE.md: Project source of truth

Read this first in every session. If the code and this file disagree, fix one of them; do not leave them diverging.

## 1. Product vision
A dynamic, GitHub-connected personal engineering portfolio with two independent experiences on one backend/database:
- **Public Portfolio**: read-only site: intro, academics, skills, active & completed projects/case studies, achievements, experience, availability, GitHub activity, LinkedIn highlights, contact.
- **Private Admin Studio**: owner-only management of *all* content without code changes: GitHub sync/import, projects, profile, skills, achievements, experience, opportunities, socials, media, preview & publish.

All content is **database-driven**. Adding a project must never require editing React, JSON, or rebuilding. GitHub automates discovery and technical metadata; the owner keeps full control of presentation.

## 2. Owner background
B.Tech student, Instrumentation Engineering, Heritage Institute of Technology, Kolkata. Interests: AI/ML, full-stack, robotics & embedded, IoT/hardware-software integration, cybersecurity & networking, agentic AI/automation, software architecture. The portfolio must convey an **interdisciplinary engineering identity**, not "just a frontend/ML dev".

Candidate projects (NOT auto-published; owner confirms details and status): UIDAI Biometric Analytics, AI/ML Smart Plant Care, Fruit Quality (spectroscopy/VOC), NIRIKSHAN, MAITRI, CarboNex, Smart Appliance Health Monitoring, AegisDNS, Discode, ScrutinyX, MediQueue.
Achievements are added **only** after exact details and recognition status are confirmed (enforced: public requires `verification_status = 'verified'`).

## 3. Stack
TypeScript · Next.js 15 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Postgres, Auth w/ GitHub OAuth, Storage) · Octokit · Zod 4 · Vitest · Vercel hosting. No microservices or extra servers.

## 4. Architecture
```
src/app/api/public/*     read-only, anon Supabase client, RLS-enforced
src/app/api/admin/*      every handler wrapped in adminRoute() (server-side owner check)
src/app/api/webhooks/*   GitHub webhook receiver (HMAC-verified)
src/app/api/cron/*       scheduled reconciliation (CRON_SECRET bearer)
src/app/auth/*           login / callback / signout
src/lib/{config,api,auth,database,github,storage,validation,services}
src/modules/{projects,content,profile,media}   domain logic + zod schemas
supabase/migrations/     SQL (schema, constraints, RLS, storage)
tests/                   vitest (unit + executed-SQL RLS tests via PGlite)
```
Layering: **route handler → (validate with Zod) → module service → Supabase**. Routes contain no business logic. React components never call GitHub.
`src/modules/content/registry.ts` drives CRUD for skills/achievements/experiences/opportunities/socials/activities from one definition each.

### Three Supabase clients (src/lib/database/clients.ts)
| Client | Key | Use |
|---|---|---|
| `createPublicClient` | anon | all `/api/public/*`; RLS limits to published+public |
| `createSessionClient` | anon + cookies | auth checks only |
| `createAdminClient` | service role (bypasses RLS) | **only after** `requireAdmin` / webhook signature / cron secret |

## 5. Auth & security rules (non-negotiable)
- One admin. Identity = **numeric GitHub account ID** (`ADMIN_GITHUB_ID`), never username.
- `requireAdmin()` uses `auth.getUser()` (re-validates the JWT) on every admin request. 401 = no session, 403 = signed in as someone else.
- OAuth scope is `read:user` only. No repo scope. Public repo discovery needs no user token; an optional no-permission PAT only raises rate limits.
- No public registration. Also disable "Allow new users to sign up" in Supabase Auth.
- Secrets only in env; `SUPABASE_SERVICE_ROLE_KEY` is referenced solely in `config/env.ts` and `database/clients.ts` (a test enforces this).
- RLS is the real boundary; hiding UI is not security. Public API additionally allow-lists fields (`toPublicProject`).
- Uploads: type allow-list (no SVG), 10 MB cap, magic-byte check, server-chosen storage path.
- Webhooks: verify `X-Hub-Signature-256` over the raw body *before* parsing; idempotent by `X-GitHub-Delivery`.
- Never auto-publish. Imported repos become `discovered`; imported projects start `draft`/`hidden`.

## 6. Data model (see docs/DATABASE.md)
16 tables: profiles (singleton), admin_users, skills, projects, project_technologies, project_media, achievements, experiences, opportunities, social_links, current_activities, github_connections, github_repositories, github_sync_runs, github_webhook_events, media_assets.
**GitHub-sourced vs owner-authored data live in separate tables** (`github_repositories` vs `projects`). Sync writes only the former. GitHub descriptions never overwrite owner text; they are exposed separately as `repository.description`.
Publication: `draft|published|unpublished`; visibility `public|hidden`; public = published AND public. Status: `planning|in_progress|completed|archived`.
Publication/visibility/featured change only via dedicated endpoints (generic PATCH rejects them).

## 7. GitHub integration (see docs/GITHUB_INTEGRATION.md)
`GithubClient` interface (Octokit adapter) → `normalizeRepository` → `runSync` / `applyRepository` (ports: `GithubStore`) → Supabase store. Change detection via content hash; README/languages fetched only for new/changed repos. Missing repos are flagged `missing` (never deleted; projects retained). Webhook + daily cron reconciliation. Owner login is resolved from the numeric ID each run.

## 8. API conventions
Envelope: `{ ok: true, data, meta? }` / `{ ok: false, error: { code, message, details? } }`. Codes → status: 400 bad_request, 401 unauthenticated, 403 forbidden, 404 not_found, 409 conflict, 413, 415, 422 validation_failed, 502 upstream_error, 503 misconfigured, 500. JSON is snake_case matching DB columns. Public GETs send `s-maxage=60`; everything else `no-store`. Full list: docs/API.md.

## 9. Frontend design direction (NOT built yet)
**Cosmic Cartography × F1 Telemetry × Mission Control.** Deep-space black/graphite, subtle starfields and nebula gradients, restrained electric lime/amber/violet/red accents, technical type, fine grid lines and instrument markings, telemetry panels, orbital/coordinate details, purposeful animation. Sections: F1 Pit Wall (projects), Instrumentation Lab (technical visuals), Cybernetic Workstation (dev activity), Mission Control (achievements). Not a template; readable and responsive; don't overuse neon/animation. Public site and Admin Studio share tokens/components but have distinct navigation.

## 10. Development rules
TypeScript strict. Zod for all external input. Modular files; no GitHub calls in components. No mock data presented as real integration. Never claim a feature works until tested. Comments only for non-obvious logic. `.env.example` placeholders only; never commit secrets. Migrations reproducible (add new files; don't edit applied ones). Don't push to GitHub, overwrite branches, or refactor unrelated code. Before contradicting the brief, explain why.
Commands: `npm run dev | build | lint | typecheck | test`.

## 11. Status: implemented vs scaffolded
**Implemented & tested**: schema + RLS (executed in PGlite), admin guard, env validation, API envelope, validation schemas, normalisation, sync algorithm, webhook verification/idempotency, visibility rules, upload validation, route separation checks.
**Implemented, NOT yet exercised against live services**: Supabase client calls in services/stores, Octokit adapter, OAuth login/callback, storage upload, webhook/cron endpoints end-to-end, system status route. These need a real Supabase project + GitHub OAuth app (see README).
**Not implemented**: all UI (public + Admin Studio), contribution-graph data (needs GitHub GraphQL), LinkedIn (manual content only), webhook auto-creation, image dimension extraction, atomic technology replacement (RPC), rate limiting on admin routes.

## 12. Roadmap
1. Provision Supabase + GitHub OAuth app; run migration; seed admin; verify login and one real sync. 2. Generate DB types (`supabase gen types`). 3. Design tokens + public UI sections. 4. Admin Studio (repo manager first). 5. Preview/publish flow. 6. GitHub contribution graph (GraphQL). 7. Hardening: rate limits, audit log, e2e tests.
