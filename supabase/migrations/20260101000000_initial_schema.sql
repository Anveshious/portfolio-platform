-- =============================================================================
-- Initial schema for the developer portfolio platform.
-- Conventions: UUID PKs, timestamptz everywhere, RLS enabled on every table.
-- Public (anon) access is read-only and limited to published + public rows.
-- All writes go through the server (service role, after an app-level admin
-- check) or an authenticated session that passes is_admin().
-- =============================================================================


-- ---------- Enums -------------------------------------------------------------
create type development_status as enum ('planning', 'in_progress', 'completed', 'archived');
create type publication_state  as enum ('draft', 'published', 'unpublished');
create type content_visibility as enum ('public', 'hidden');
create type media_kind         as enum ('profile_photo', 'thumbnail', 'screenshot', 'architecture_diagram', 'certificate', 'achievement_image', 'other');
create type project_media_role as enum ('thumbnail', 'screenshot', 'architecture_diagram');
create type experience_level   as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type recognition_type   as enum ('award', 'finalist', 'participation', 'certification', 'publication', 'leadership', 'other');
create type verification_status as enum ('unverified', 'verified');
create type repository_status  as enum ('discovered', 'imported', 'ignored', 'missing');
create type sync_trigger       as enum ('initial', 'manual', 'scheduled', 'webhook');
create type sync_status        as enum ('running', 'succeeded', 'failed', 'partial');
create type webhook_status     as enum ('received', 'processed', 'ignored', 'failed');

-- ---------- Helpers -----------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- admin_users -------------------------------------------------------
-- The GitHub numeric account ID is the identity anchor. user_id is linked
-- automatically on first GitHub login (trigger below). Rows are inserted
-- manually by the owner (see docs/DATABASE.md); there is no public registration.
create table admin_users (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete cascade,
  github_user_id bigint not null unique,
  github_login   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

create or replace function link_admin_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  gh_id text;
begin
  gh_id := coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub');
  if gh_id is not null and gh_id ~ '^[0-9]+$' then
    update admin_users
       set user_id = new.id,
           github_login = coalesce(new.raw_user_meta_data ->> 'user_name', github_login)
     where github_user_id = gh_id::bigint
       and (user_id is null or user_id = new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_link_admin
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function link_admin_user();

-- ---------- media_assets ------------------------------------------------------
create table media_assets (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null default 'portfolio-media',
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width        integer check (width > 0),
  height       integer check (height > 0),
  alt_text     text,
  kind         media_kind not null default 'other',
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index media_assets_kind_idx on media_assets (kind);

-- ---------- profiles (singleton) ----------------------------------------------
create table profiles (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  headline        text,
  biography       text,
  photo_asset_id  uuid references media_assets(id) on delete set null,
  institution     text,
  degree          text,
  field_of_study  text,
  graduation_year integer check (graduation_year between 1950 and 2100),
  location        text,
  contact_email   text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  visibility      content_visibility not null default 'hidden',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Enforce exactly one profile row.
create unique index profiles_singleton_idx on profiles ((true));

-- ---------- github_connections ------------------------------------------------
-- Tracks the owner's GitHub identity. Deliberately stores NO OAuth tokens:
-- public repository discovery needs none, and tokens never belong in app tables.
create table github_connections (
  id                uuid primary key default gen_random_uuid(),
  admin_user_id     uuid not null references admin_users(id) on delete cascade,
  github_user_id    bigint not null unique,
  github_login      text not null,
  status            text not null default 'active' check (status in ('active', 'revoked', 'error')),
  last_validated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------- github_repositories (GitHub-sourced; never edited by hand) --------
create table github_repositories (
  id                   uuid primary key default gen_random_uuid(),
  github_repository_id bigint not null unique,
  connection_id        uuid references github_connections(id) on delete set null,
  name                 text not null,
  full_name            text not null,
  html_url             text not null,
  description          text,
  primary_language     text,
  languages            jsonb not null default '{}'::jsonb,
  topics               text[] not null default '{}',
  stars                integer not null default 0 check (stars >= 0),
  forks                integer not null default 0 check (forks >= 0),
  default_branch       text,
  is_fork              boolean not null default false,
  is_archived          boolean not null default false,
  github_created_at    timestamptz,
  github_updated_at    timestamptz,
  github_pushed_at     timestamptz,
  readme_markdown      text,
  readme_sha           text,
  content_hash         text not null,           -- change detection across syncs
  status               repository_status not null default 'discovered',
  first_seen_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index github_repositories_status_idx on github_repositories (status);
create index github_repositories_pushed_idx on github_repositories (github_pushed_at desc);

-- ---------- projects ------------------------------------------------------------
create table projects (
  id                     uuid primary key default gen_random_uuid(),
  -- link to GitHub-sourced data (optional: manual projects have none)
  github_repository_id   uuid unique references github_repositories(id) on delete set null,
  -- owner-managed
  title                  text not null check (length(trim(title)) > 0),
  slug                   text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_description      text,
  detailed_description   text,
  problem_statement      text,
  proposed_solution      text,
  architecture_description text,
  role_and_contribution  text,
  category               text,
  live_demo_url          text check (live_demo_url is null or live_demo_url ~* '^https?://'),
  featured               boolean not null default false,
  visibility             content_visibility not null default 'hidden',
  publication_state      publication_state not null default 'draft',
  development_status     development_status not null default 'planning',
  display_order          integer not null default 0,
  published_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A project cannot be published without presentable content.
  constraint projects_published_has_summary check (
    publication_state <> 'published' or (short_description is not null and length(trim(short_description)) > 0)
  )
);
create index projects_public_idx   on projects (display_order) where publication_state = 'published' and visibility = 'public';
create index projects_featured_idx on projects (display_order) where featured;
create index projects_status_idx   on projects (development_status);

create table project_technologies (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table project_media (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  role           project_media_role not null,
  caption        text,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (project_id, media_asset_id, role)
);
-- At most one thumbnail and one architecture diagram per project.
create unique index project_media_one_thumbnail_idx on project_media (project_id) where role = 'thumbnail';
create unique index project_media_one_diagram_idx   on project_media (project_id) where role = 'architecture_diagram';

-- ---------- skills ----------------------------------------------------------------
create table skills (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique check (length(trim(name)) > 0),
  category             text not null,
  related_technologies text[] not null default '{}',
  experience_level     experience_level,
  display_order        integer not null default 0,
  visibility           content_visibility not null default 'public',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index skills_category_idx on skills (category, display_order);

-- ---------- achievements -----------------------------------------------------------
create table achievements (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (length(trim(title)) > 0),
  organisation        text,
  description         text,
  achieved_on         date,
  recognition_type    recognition_type not null default 'other',
  media_asset_id      uuid references media_assets(id) on delete set null,
  verification_status verification_status not null default 'unverified',
  display_order       integer not null default 0,
  visibility          content_visibility not null default 'hidden',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Owner requirement: nothing is shown publicly until its details are confirmed.
  constraint achievements_public_requires_verified check (visibility = 'hidden' or verification_status = 'verified')
);
create index achievements_date_idx on achievements (achieved_on desc);

-- ---------- experiences --------------------------------------------------------------
create table experiences (
  id            uuid primary key default gen_random_uuid(),
  organisation  text not null,
  position      text not null,
  description   text,
  start_date    date,
  end_date      date,
  links         jsonb not null default '[]'::jsonb,
  display_order integer not null default 0,
  visibility    content_visibility not null default 'hidden',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- ---------- opportunities ---------------------------------------------------------------
create table opportunities (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  description   text,
  availability  text,
  display_order integer not null default 0,
  visibility    content_visibility not null default 'hidden',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- social_links -------------------------------------------------------------------
create table social_links (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null unique check (length(trim(platform)) > 0),
  url           text not null check (url ~* '^(https?://|mailto:)'),
  label         text,
  highlight     text,                 -- manually maintained (e.g. LinkedIn highlights)
  display_order integer not null default 0,
  visibility    content_visibility not null default 'public',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- current_activities -----------------------------------------------------------------
create table current_activities (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  current_focus      text,
  development_status development_status not null default 'in_progress',
  project_id         uuid references projects(id) on delete set null,
  display_order      integer not null default 0,
  visibility         content_visibility not null default 'hidden',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- GitHub operational tables (admin-only) -------------------------------------------------
create table github_sync_runs (
  id               uuid primary key default gen_random_uuid(),
  trigger          sync_trigger not null,
  status           sync_status not null default 'running',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  repos_seen       integer not null default 0,
  repos_created    integer not null default 0,
  repos_updated    integer not null default 0,
  repos_unchanged  integer not null default 0,
  repos_missing    integer not null default 0,
  error_message    text,
  created_at       timestamptz not null default now()
);
create index github_sync_runs_started_idx on github_sync_runs (started_at desc);

create table github_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  delivery_id      text not null unique,      -- X-GitHub-Delivery: idempotency key
  event_type       text not null,
  action           text,
  repository_id    bigint,
  signature_valid  boolean not null,
  status           webhook_status not null default 'received',
  payload          jsonb not null,
  error_message    text,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz
);
create index github_webhook_events_received_idx on github_webhook_events (received_at desc);

-- ---------- updated_at triggers -----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'admin_users','media_assets','profiles','github_connections','github_repositories',
    'projects','skills','achievements','experiences','opportunities','social_links','current_activities'
  ] loop
    execute format('create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Stamp published_at the first time a project is published.
create or replace function stamp_project_published_at() returns trigger
language plpgsql as $$
begin
  if new.publication_state = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;
create trigger projects_stamp_published_at before insert or update on projects
  for each row execute function stamp_project_published_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table admin_users            enable row level security;
alter table media_assets           enable row level security;
alter table profiles               enable row level security;
alter table github_connections     enable row level security;
alter table github_repositories    enable row level security;
alter table projects               enable row level security;
alter table project_technologies   enable row level security;
alter table project_media          enable row level security;
alter table skills                 enable row level security;
alter table achievements           enable row level security;
alter table experiences            enable row level security;
alter table opportunities          enable row level security;
alter table social_links           enable row level security;
alter table current_activities     enable row level security;
alter table github_sync_runs       enable row level security;
alter table github_webhook_events  enable row level security;

-- Admin: full access (authenticated session whose uid is in admin_users).
do $$
declare t text;
begin
  foreach t in array array[
    'admin_users','media_assets','profiles','github_connections','github_repositories',
    'projects','project_technologies','project_media','skills','achievements','experiences',
    'opportunities','social_links','current_activities','github_sync_runs','github_webhook_events'
  ] loop
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- Public read policies. Only visible, published content.
create policy profiles_public_read on profiles for select to anon, authenticated
  using (visibility = 'public');

create policy projects_public_read on projects for select to anon, authenticated
  using (publication_state = 'published' and visibility = 'public');

create policy project_technologies_public_read on project_technologies for select to anon, authenticated
  using (exists (select 1 from projects p where p.id = project_id
                 and p.publication_state = 'published' and p.visibility = 'public'));

create policy project_media_public_read on project_media for select to anon, authenticated
  using (exists (select 1 from projects p where p.id = project_id
                 and p.publication_state = 'published' and p.visibility = 'public'));

-- Repository rows are only readable when linked to a public, published project.
create policy github_repositories_public_read on github_repositories for select to anon, authenticated
  using (exists (select 1 from projects p where p.github_repository_id = github_repositories.id
                 and p.publication_state = 'published' and p.visibility = 'public'));

create policy skills_public_read on skills for select to anon, authenticated using (visibility = 'public');
create policy achievements_public_read on achievements for select to anon, authenticated using (visibility = 'public');
create policy experiences_public_read on experiences for select to anon, authenticated using (visibility = 'public');
create policy opportunities_public_read on opportunities for select to anon, authenticated using (visibility = 'public');
create policy social_links_public_read on social_links for select to anon, authenticated using (visibility = 'public');
create policy current_activities_public_read on current_activities for select to anon, authenticated using (visibility = 'public');

-- Media metadata is public only when referenced by public content.
create policy media_assets_public_read on media_assets for select to anon, authenticated
  using (
    exists (select 1 from profiles p where p.photo_asset_id = media_assets.id and p.visibility = 'public')
    or exists (select 1 from project_media pm join projects pr on pr.id = pm.project_id
               where pm.media_asset_id = media_assets.id
                 and pr.publication_state = 'published' and pr.visibility = 'public')
    or exists (select 1 from achievements a where a.media_asset_id = media_assets.id and a.visibility = 'public')
  );

-- admin_users, github_connections, github_sync_runs, github_webhook_events:
-- no public policy => anon/authenticated non-admin users see nothing.

-- =============================================================================
-- Storage: one public-read bucket, admin-only writes, enforced type/size limits.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-media', 'portfolio-media', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif','application/pdf'])
on conflict (id) do nothing;

create policy portfolio_media_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'portfolio-media' and is_admin())
  with check (bucket_id = 'portfolio-media' and is_admin());
-- Public read of objects is provided by the bucket's public flag (URL access).

-- =============================================================================
-- Public GitHub aggregate. SECURITY DEFINER so anon can read ONLY these totals,
-- never the repository rows themselves (RLS on github_repositories stays strict).
-- Repositories the owner marked 'ignored', or that disappeared, are excluded.
-- =============================================================================
create or replace function public_github_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with visible as (
    select * from github_repositories where status in ('discovered', 'imported') and not is_fork
  )
  select jsonb_build_object(
    'repository_count', (select count(*) from visible),
    'total_stars',      (select coalesce(sum(stars), 0) from visible),
    'total_forks',      (select coalesce(sum(forks), 0) from visible),
    'last_synced_at',   (select max(last_synced_at) from visible),
    'languages', coalesce((
      select jsonb_object_agg(lang, bytes)
      from (select e.key as lang, sum(e.value::bigint) as bytes
            from visible v, jsonb_each_text(v.languages) e
            group by e.key) agg
    ), '{}'::jsonb)
  );
$$;
revoke all on function public_github_summary() from public;
grant execute on function public_github_summary() to anon, authenticated;
