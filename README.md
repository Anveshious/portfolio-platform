# Developer Portfolio Platform

A database-driven, GitHub-connected portfolio with a public site and a private Admin Studio on one backend. **Status: backend foundation** (UI not built yet). See [CLAUDE.md](CLAUDE.md) for architecture, rules and the implemented-vs-scaffolded matrix.

**Stack:** TypeScript, Next.js 15 (App Router), React 19, Tailwind 4, Supabase (Postgres/Auth/Storage), Octokit, Zod, Vitest, Vercel.

## Prerequisites
Node.js ≥ 20, npm, a Supabase project, a GitHub account, (optional) Supabase CLI.

## Install
```bash
npm install
cp .env.example .env.local
```

## Configure
1. **Supabase**: create a project. Copy URL, anon key, service-role key into `.env.local`.
2. **Admin identity**: set `ADMIN_GITHUB_ID` to your numeric GitHub ID (`curl https://api.github.com/users/<you>` → `id`).
3. **GitHub OAuth app** (GitHub → Settings → Developer settings → OAuth Apps): callback URL = Supabase's callback shown under *Auth → Providers → GitHub*. Paste client ID/secret into Supabase. Keep scope minimal (the app requests only `read:user`).
4. **Supabase Auth settings**: set Site URL to `NEXT_PUBLIC_SITE_URL`, add `http://localhost:3000/auth/callback` to redirect URLs, and **disable "Allow new users to sign up"** after your first login.
5. Generate `GITHUB_WEBHOOK_SECRET` and `CRON_SECRET` with `openssl rand -hex 32` (details: [docs/GITHUB_INTEGRATION.md](docs/GITHUB_INTEGRATION.md)).

## Database
```bash
supabase link --project-ref <ref> && supabase db push      # or paste the SQL into the SQL editor
```
Then seed the admin row once (before your first login):
```sql
insert into admin_users (github_user_id, github_login) values (<YOUR_NUMERIC_ID>, '<your-login>');
```
Details: [docs/DATABASE.md](docs/DATABASE.md).

## Run
```bash
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
```
Sign in at `/auth/login`. Then `POST /api/admin/github/sync` with `{"mode":"initial"}`, list `GET /api/admin/github/repositories`, import one, fill in its description, and publish. API reference: [docs/API.md](docs/API.md).

## Testing
`npm test` runs 84 tests: validation, auth guards, public/admin route separation, visibility rules, normalisation, sync/webhook logic, and the **real SQL migration executed in PGlite** to verify RLS and constraints. Tests do not hit Supabase or GitHub.

## Deployment preparation (Vercel)
Import the repo, add every variable from `.env.example` (service-role key and secrets as server-only), set `NEXT_PUBLIC_SITE_URL` to the production URL and add its `/auth/callback` to Supabase redirect URLs. `vercel.json` registers a daily cron for `/api/cron/github-sync` (Vercel sends `Authorization: Bearer $CRON_SECRET`).
