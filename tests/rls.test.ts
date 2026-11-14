import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Executes the REAL migration in an in-process Postgres (PGlite) with minimal stand-ins for
 * Supabase's `auth` and `storage` schemas, then verifies RLS as the anon / authenticated roles.
 */
const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function as(role: "anon" | "authenticated" | "postgres", uid: string | null, fn: () => Promise<void>) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { await fn(); } finally { await db.exec("reset role;"); }
}
const count = async (sql: string) => Number(((await db.query<{ n: string }>(`select count(*) n from (${sql}) t`)).rows[0]!.n));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  await db.exec(readFileSync(path.resolve(__dirname, "../supabase/migrations/20260101000000_initial_schema.sql"), "utf8"));
  await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;
                 grant usage on schema auth to anon, authenticated;`);

  // Owner is pre-seeded by GitHub ID, then "logs in" (auth.users insert fires the linking trigger).
  await db.exec(`insert into admin_users (github_user_id, github_login) values (12345, 'owner');
    insert into auth.users (id, raw_user_meta_data) values ('${OWNER}', '{"provider_id":"12345","user_name":"owner"}'),
                                                           ('${STRANGER}', '{"provider_id":"99999","user_name":"stranger"}');
    insert into projects (title, slug, short_description, publication_state, visibility) values
      ('Pub', 'pub', 'x', 'published', 'public'),
      ('PubHidden', 'pub-hidden', 'x', 'published', 'hidden'),
      ('Draft', 'draft', null, 'draft', 'hidden'),
      ('Unpub', 'unpub', 'x', 'unpublished', 'public');
    insert into achievements (title, verification_status, visibility) values ('Verified', 'verified', 'public'), ('Secret', 'unverified', 'hidden');
    insert into github_repositories (github_repository_id, name, full_name, html_url, content_hash) values (1, 'a', 'o/a', 'u', 'h'), (2, 'b', 'o/b', 'u', 'h');
    update projects set github_repository_id = (select id from github_repositories where github_repository_id = 1) where slug = 'pub';
    insert into github_webhook_events (delivery_id, event_type, signature_valid, payload) values ('d', 'push', true, '{}');
  `);
});
afterAll(async () => { await db.close(); });

describe("migration + RLS (executed against real Postgres)", () => {
  it("links the owner's auth user via GitHub ID, and ONLY the owner", async () => {
    const rows = (await db.query<{ user_id: string }>("select user_id from admin_users")).rows;
    expect(rows[0]!.user_id).toBe(OWNER);
  });

  it("anon sees only published + public projects", async () => {
    await as("anon", null, async () => {
      expect(await count("select 1 from projects")).toBe(1);
      expect(await count("select 1 from projects where slug = 'pub'")).toBe(1);
    });
  });

  it("anon sees only public achievements and cannot read admin/GitHub operational tables", async () => {
    await as("anon", null, async () => {
      expect(await count("select 1 from achievements")).toBe(1);
      expect(await count("select 1 from admin_users")).toBe(0);
      expect(await count("select 1 from github_webhook_events")).toBe(0);
      expect(await count("select 1 from github_sync_runs")).toBe(0);
    });
  });

  it("anon only sees repositories linked to a public project", async () => {
    await as("anon", null, async () => { expect(await count("select 1 from github_repositories")).toBe(1); });
  });

  it("anon cannot write", async () => {
    await as("anon", null, async () => {
      await expect(db.exec("insert into skills (name, category) values ('x','y')")).rejects.toThrow();
      expect((await db.query("update projects set title = 'hax' returning id")).rows).toHaveLength(0); // RLS hides every row from UPDATE
    });
  });

  it("a signed-in NON-admin has no extra access", async () => {
    await as("authenticated", STRANGER, async () => {
      expect(await count("select 1 from projects")).toBe(1);
      expect(await count("select 1 from admin_users")).toBe(0);
      await expect(db.exec("insert into skills (name, category) values ('x','y')")).rejects.toThrow();
    });
  });

  it("the owner (is_admin) can read and write everything", async () => {
    await as("authenticated", OWNER, async () => {
      expect(await count("select 1 from projects")).toBe(4);
      expect(await count("select 1 from github_webhook_events")).toBe(1);
      await db.exec("insert into skills (name, category) values ('TypeScript','Languages')");
    });
  });

  it("published projects require a short description (DB constraint)", async () => {
    await expect(db.exec("update projects set publication_state='published' where slug='draft'")).rejects.toThrow(/projects_published_has_summary/);
  });

  it("achievements cannot be public unless verified (DB constraint)", async () => {
    await expect(db.exec("update achievements set visibility='public' where title='Secret'")).rejects.toThrow(/achievements_public_requires_verified/);
  });

  it("GitHub repository IDs are unique; profile is a singleton", async () => {
    await expect(db.exec("insert into github_repositories (github_repository_id, name, full_name, html_url, content_hash) values (1,'dup','o/dup','u','h')")).rejects.toThrow();
    await db.exec("insert into profiles (full_name) values ('A')");
    await expect(db.exec("insert into profiles (full_name) values ('B')")).rejects.toThrow();
  });

  it("deleting a project keeps the repository; deleting a repository keeps the project", async () => {
    await db.exec("delete from github_repositories where github_repository_id = 1");
    expect(await count("select 1 from projects where slug='pub'")).toBe(1);
    expect(await count("select 1 from projects where slug='pub' and github_repository_id is null")).toBe(1);
  });

  it("public_github_summary() exposes only aggregates to anon", async () => {
    await as("anon", null, async () => {
      const r = await db.query<{ s: Record<string, unknown> }>("select public_github_summary() s");
      expect(Object.keys(r.rows[0]!.s).sort()).toEqual(["languages", "last_synced_at", "repository_count", "total_forks", "total_stars"]);
    });
  });

  it("slug format and unique slug are enforced", async () => {
    await expect(db.exec("insert into projects (title, slug) values ('t', 'Bad Slug')")).rejects.toThrow();
    await expect(db.exec("insert into projects (title, slug) values ('t', 'pub')")).rejects.toThrow();
  });
});
