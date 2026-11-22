const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PGlite } = require("@electric-sql/pglite");
const { validatePublicConfig } = require("../build-config.js");
const root = path.join(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const admin = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const fixtureConfig = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "sb_publishable_test_fixture" };

function outputFingerprint(directory) {
  if (!fs.existsSync(directory)) return "missing";
  const hash = crypto.createHash("sha256");
  function visit(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) visit(file);
      else hash.update(path.relative(directory, file)).update(fs.readFileSync(file));
    }
  }
  visit(directory);
  return hash.digest("hex");
}

test("build accepts only publishable keys and does not write rejected values", () => {
  const secret = "sb_" + "secret_" + crypto.randomBytes(12).toString("hex");
  const serviceJwt = ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"), "fixture"].join(".");
  for (const key of [secret, "service_role_fixture", serviceJwt, "ISI_DENGAN_KEY", "", "sb_publishable_service_role_fixture"]) {
    assert.throws(() => validatePublicConfig({ ...fixtureConfig, SUPABASE_ANON_KEY: key }), /SUPABASE_ANON_KEY/);
    const before = outputFingerprint(path.join(root, "public"));
    const result = spawnSync(process.execPath, ["build-config.js"], { cwd: root, env: { ...process.env, ...fixtureConfig, SUPABASE_ANON_KEY: key }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SUPABASE_ANON_KEY/);
    if (key) assert(!result.stdout.includes(key) && !result.stderr.includes(key));
    assert.equal(outputFingerprint(path.join(root, "public")), before);
  }
  const credentialUrl = new URL(fixtureConfig.SUPABASE_URL);
  credentialUrl.username = "fixture-user";
  credentialUrl.password = crypto.randomBytes(8).toString("hex");
  for (const url of ["http://fixture.invalid", credentialUrl.href, "https://fixture.invalid/path", "not-a-url"]) {
    assert.throws(() => validatePublicConfig({ ...fixtureConfig, SUPABASE_URL: url }), /SUPABASE_URL/);
  }
  assert.deepEqual(validatePublicConfig(fixtureConfig), { url: fixtureConfig.SUPABASE_URL, anonKey: fixtureConfig.SUPABASE_ANON_KEY });
  const built = spawnSync(process.execPath, ["build-config.js"], { cwd: root, env: { ...process.env, ...fixtureConfig }, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const sandbox = { window: {} };
  vm.runInNewContext(read("public/config.js"), sandbox);
  assert.deepEqual(Object.keys(sandbox.window.SUPABASE_CONFIG).sort(), ["anonKey", "url"]);
  assert.equal(sandbox.window.SUPABASE_CONFIG.anonKey, fixtureConfig.SUPABASE_ANON_KEY);
  for (const filename of [".env", "schema.sql", "migration-admin-security.sql", "build-config.js", "README.md"]) {
    assert(!fs.existsSync(path.join(root, "public", filename)), `${filename} must not be deployed`);
  }
});

test("security migration matches fresh schema and keeps admin out of public navigation", () => {
  const block = text => text.split("-- BEGIN MASJID SECURITY")[1].split("-- END MASJID SECURITY")[0];
  assert.equal(block(read("schema.sql")), block(read("migration-admin-security.sql")));
  assert.match(read("admin.html"), /name="robots" content="noindex, nofollow, noarchive"/);
  assert(!/(?:href|src)\s*=\s*["'][^"']*admin\.html/i.test(read("index.html")));
  const headers = JSON.parse(read("vercel.json")).headers;
  assert(headers.find(rule => rule.source === "/admin.html").headers.some(h => h.key === "X-Robots-Tag" && h.value.includes("noindex")));
  assert.equal(JSON.parse(read("vercel.json")).outputDirectory, "public");
});

test("public reader refuses unsafe keys and keeps anonymous REST queries unchanged", async () => {
  for (const key of ["", "legacy-key", "sb_" + "secret_fixture", "sb_publishable_service_role_fixture"]) {
    const sandbox = { window: { SUPABASE_CONFIG: { url: fixtureConfig.SUPABASE_URL, anonKey: key } }, URL, URLSearchParams };
    vm.runInNewContext(read("public-client.js"), sandbox);
    assert.equal(sandbox.window.MASJID_PUBLIC_CLIENT, undefined);
  }
  const requests = [];
  const sandbox = {
    window: { SUPABASE_CONFIG: { url: fixtureConfig.SUPABASE_URL, anonKey: fixtureConfig.SUPABASE_ANON_KEY } },
    URL, URLSearchParams,
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => [{ id: "fixture" }] }; }
  };
  vm.runInNewContext(read("public-client.js"), sandbox);
  const result = await sandbox.window.MASJID_PUBLIC_CLIENT.from("kegiatan").select("id").eq("status", "published").order("event_date", { ascending: false, nullsFirst: false });
  assert.equal(result.data[0].id, "fixture");
  assert.equal(requests[0].url.searchParams.get("status"), "eq.published");
  assert.equal(requests[0].url.searchParams.get("order"), "event_date.desc.nullslast");
  assert.equal(requests[0].options.headers.apikey, fixtureConfig.SUPABASE_ANON_KEY);
  assert.equal(requests[0].options.headers.Authorization, undefined);
});

test("real PostgreSQL RLS: admin-only writes, private allowlist, owner-only Storage, idempotent migration", async () => {
  const db = new PGlite();
  const as = async (role, uid = "") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const denied = sql => assert.rejects(() => db.query(sql), /permission denied|row-level security/);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      insert into auth.users values ('${admin}'), ('${other}');
    `);
    await db.exec(read("schema.sql"));
    await db.exec(read("seed.sql"));
    const before = (await db.query("select id,title,description,category,event_date,image_url,image_urls,status from public.kegiatan order by id")).rows;
    // Reproduce extra legacy grants/policies before migrating an existing project.
    await db.exec(`grant all on public.kegiatan to anon,authenticated;
      create policy fixture_old_content on public.kegiatan for all to anon,authenticated using(true) with check(true);
      create policy fixture_old_storage on storage.objects for all to anon,authenticated using(true) with check(true);`);
    await db.exec(read("migration-admin-security.sql"));
    await db.exec(read("migration-admin-security.sql"));
    assert.deepEqual((await db.query("select id,title,description,category,event_date,image_url,image_urls,status from public.kegiatan order by id")).rows, before);
    assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='fixture_old_content'")).rows[0].n, 0);
    await as("authenticated", admin);
    assert.equal((await db.query("select public.is_masjid_admin() allowed")).rows[0].allowed, false);
    await denied("insert into kegiatan(title) values ('not allowlisted')");
    await as("postgres");
    await db.exec(`insert into masjid_private.admin_allowlist(user_id) values ('${admin}')`);
    await db.exec(read("schema.sql"));
    assert.equal((await db.query("select count(*)::int n from masjid_private.admin_allowlist")).rows[0].n, 1);

    await as("authenticated", admin);
    assert.equal((await db.query("select public.is_masjid_admin() allowed")).rows[0].allowed, true);
    await db.exec(`
      insert into kegiatan(id,title,status) values ('73333333-3333-4333-8333-333333333333','fixture published','published');
      insert into kegiatan(title,status) values ('fixture draft','draft');
      insert into pengumuman(id,title,body,status) values ('44444444-4444-4444-8444-444444444444','fixture announcement','body','published');
      insert into pengumuman(title,body,status,end_date) values ('fixture expired','body','published','2000-01-01');
      insert into organization_groups(id,name,kind) values ('55555555-5555-4555-8555-555555555555','fixture group','section');
      insert into organization_members(id,group_id,name) values ('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555','fixture member');
    `);
    const rows = [
      ["kegiatan", "'73333333-3333-4333-8333-333333333333'", "title='edited'", "(title) values ('unauthorized')"],
      ["pengumuman", "'44444444-4444-4444-8444-444444444444'", "title='edited'", "(title,body) values ('unauthorized','body')"],
      ["organization_groups", "'55555555-5555-4555-8555-555555555555'", "name='edited'", "(name,kind) values ('unauthorized','section')"],
      ["organization_members", "'66666666-6666-4666-8666-666666666666'", "name='edited'", "(name,group_id) values ('unauthorized','55555555-5555-4555-8555-555555555555')"],
      ["site_settings", "1", "profile='{}'::jsonb", "(id) values (1)"]
    ];
    for (const [table,id,update] of rows) {
      assert.equal((await db.query(`update ${table} set ${update} where id=${id} returning id`)).rows.length, 1);
    }
    await as("authenticated", other);
    assert.equal((await db.query("select public.is_masjid_admin() allowed")).rows[0].allowed, false);
    await denied("select * from masjid_private.admin_allowlist");
    await denied(`insert into masjid_private.admin_allowlist(user_id) values ('${other}')`);
    for (const [table,id,update,insert] of rows) {
      await denied(`insert into ${table}${insert}`);
      assert.equal((await db.query(`update ${table} set ${update} where id=${id} returning id`)).rows.length, 0);
      if (table === "site_settings") await denied(`delete from ${table} where id=${id}`);
      else assert.equal((await db.query(`delete from ${table} where id=${id} returning id`)).rows.length, 0);
    }
    await denied("truncate kegiatan");
    assert.equal((await db.query("select count(*)::int n from kegiatan where status='draft'")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from pengumuman where title='fixture expired'")).rows[0].n, 0);
    await as("anon");
    for (const [table,id,update,insert] of rows) {
      await denied(`insert into ${table}${insert}`);
      await denied(`update ${table} set ${update} where id=${id}`);
      await denied(`delete from ${table} where id=${id}`);
    }
    assert.equal((await db.query("select public.is_masjid_admin() allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select count(*)::int n from kegiatan where status='draft'")).rows[0].n, 0);

    await as("postgres");
    await db.exec(`insert into storage.objects(bucket_id,name) values ('masjid-media','${other}/old.webp'), ('masjid-media','orphan.webp')`);
    await as("authenticated", admin);
    await db.exec(`insert into storage.objects(bucket_id,name) values ('masjid-media','${admin}/own.webp')`);
    await denied(`insert into storage.objects(bucket_id,name) values ('masjid-media','${other}/wrong.webp')`);
    await denied(`update storage.objects set name='${other}/renamed.webp' where name='${admin}/own.webp'`);
    assert.equal((await db.query(`delete from storage.objects where bucket_id='masjid-media' and name='${other}/old.webp' returning id`)).rows.length, 0);
    assert.equal((await db.query("delete from storage.objects where bucket_id='masjid-media' and name='orphan.webp' returning id")).rows.length, 0);
    await as("authenticated", other);
    await denied(`insert into storage.objects(bucket_id,name) values ('masjid-media','${other}/new.webp')`);
    assert.equal((await db.query("delete from storage.objects where bucket_id='masjid-media' returning id")).rows.length, 0);
    await db.exec(`insert into storage.objects(bucket_id,name) values ('unrelated-bucket','unrelated.webp')`);
    await as("anon");
    await denied("insert into storage.objects(bucket_id,name) values ('masjid-media','anon/new.webp')");
    assert.equal((await db.query("delete from storage.objects where bucket_id='masjid-media' returning id")).rows.length, 0);
    assert.equal((await db.query("select * from storage.objects where bucket_id='masjid-media'")).rows.length, 3);
    await as("authenticated", admin);
    assert.equal((await db.query(`delete from storage.objects where name='${admin}/own.webp' returning id`)).rows.length, 1);
    for (const [table,id] of rows.filter(([table]) => table !== "site_settings").reverse()) {
      assert.equal((await db.query(`delete from ${table} where id=${id} returning id`)).rows.length, 1);
    }
    await as("postgres");
    await db.exec("delete from masjid_private.admin_allowlist");
    await as("authenticated", admin);
    await denied("insert into kegiatan(title) values ('permission revoked')");
  } finally { await db.close(); }
});
