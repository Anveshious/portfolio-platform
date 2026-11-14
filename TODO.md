# TODO: next steps after the backend foundation

Order matters: finish sections 1 and 2 before any frontend work. Status of the foundation itself lives in `CLAUDE.md` (section 11).

## 1. Owner setup (you)
- [ ] Create a Supabase project; put URL, anon key and service-role key in `.env.local`
- [ ] Find your numeric GitHub ID (`curl https://api.github.com/users/<you>`) and set `ADMIN_GITHUB_ID`
- [ ] Create a GitHub OAuth app; add its client ID/secret to Supabase (Auth → Providers → GitHub)
- [ ] Supabase Auth: set Site URL; add `http://localhost:3000/auth/callback` to redirect URLs
- [ ] Generate `GITHUB_WEBHOOK_SECRET` and `CRON_SECRET` (`openssl rand -hex 32`)
- [ ] Run the migration (`supabase db push`); confirm the `portfolio-media` bucket exists
- [ ] **Before first login:** `insert into admin_users (github_user_id, github_login) values (<id>, '<login>');`
- [ ] After a successful login, disable "Allow new users to sign up"

## 2. Live verification (you run, Claude fixes)
Expect the first bugs in Supabase embedded selects and OAuth cookie handling: both are written but never run against real services.
- [ ] `/auth/login` lands on `/admin` showing "authenticated as owner"
- [ ] A second GitHub account is signed out and sent to `?error=not_authorised`
- [ ] `GET /api/admin/system/status`: database ok, GitHub rate limit shown
- [ ] `POST /api/admin/github/sync` `{"mode":"initial"}`: public repos appear as `discovered`
- [ ] A second sync reports everything `unchanged`
- [ ] Import a repo → PATCH → publish: appears in `/api/public/projects`; unpublished ones do not
- [ ] Publishing without a short description returns 422
- [ ] Upload a PNG and attach it to a project: URL loads publicly; a renamed `.exe` is rejected
- [ ] GitHub webhook ping accepted; redelivery reports `duplicate` (needs a public URL: Vercel preview or smee/ngrok)
- [ ] Cron route: 200 with bearer token, 401 without

## 3. Hardening (Claude, before the UI)
- [ ] CSRF: `Origin` check on admin POST/PATCH/DELETE (cookie auth) — highest priority
- [ ] Rate limiting on admin routes, uploads and the webhook
- [ ] Generate typed DB client (`supabase gen types`), replace loose row typing
- [ ] Atomic technology replacement via a DB function (currently delete + insert)
- [ ] Audit log table for publish / unpublish / delete
- [ ] GitHub contribution graph via GraphQL (PAT with no extra permissions)
- [ ] Live integration tests against a local Supabase

## 4. Content collection (you, in parallel)
- [ ] Per project: title, one-line summary in your own words, problem, solution, architecture, your role, technologies, status, category, demo link, thumbnail, screenshots, architecture diagram
- [ ] Profile: photo, headline, bio, academics, contact email
- [ ] Social links and LinkedIn highlights
- [ ] Skills grouped by category
- [ ] Achievements: exact name, organiser, date, recognition type (nothing goes public until verified)
- [ ] Experience and leadership entries; current availability and opportunities

## 5. Frontend (after sections 2 and 3)
- [ ] Design tokens: fonts, colours, grid and starfield primitives
- [ ] Public site: hero → projects (pit-wall layout) → project detail → skills → GitHub activity → achievements → contact
- [ ] Admin Studio: GitHub repo manager → project editor + publish flow → profile → remaining managers → media library
- [ ] Preview-before-publish

## Decisions needed
- [ ] Domain: `*.vercel.app` or custom (affects OAuth redirect and webhook URLs)
- [ ] Build a static design mock and review it before coding the UI?
- [ ] Admin Studio on mobile, or desktop-only?
