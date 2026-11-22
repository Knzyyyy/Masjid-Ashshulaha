-- Setup baru: jalankan file ini di Supabase SQL Editor, lalu seed.sql.
-- Proyek yang sudah berjalan: gunakan migration-admin-security.sql; tidak perlu seed ulang.
-- LANGKAH MANUAL PEMILIK PROYEK (tidak memerlukan email/password/key di kode):
-- 1. Authentication > Users: pilih akun admin Anda dan salin User UID.
-- 2. Setelah SQL berhasil, jalankan di SQL Editor (ganti placeholder dengan UID tadi):
--    insert into masjid_private.admin_allowlist (user_id) values ('UID_ADMIN_ANDA'::uuid)
--    on conflict (user_id) do nothing;
--    Allowlist kosong menolak semua operasi tulis. Hanya masukkan akun admin Anda.
-- 3. Authentication > Sign In / Providers > Email: matikan Allow new users to sign up.
--    Nama/lokasi menu dapat berbeda; jangan mematikan login Email yang dipakai admin.
-- 4. Vercel: SUPABASE_ANON_KEY harus publishable key (sb_publishable_), bukan secret.
-- Aman dijalankan ulang: konten dan allowlist yang sudah ada dipertahankan.
begin;

create table if not exists public.kegiatan (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Kajian',
  event_date date,
  image_url text,
  image_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(image_urls) = 'array'),
  created_at timestamptz not null default now()
);
alter table public.kegiatan add column if not exists image_urls jsonb not null default '[]'::jsonb
  check (jsonb_typeof(image_urls) = 'array');
update public.kegiatan set image_urls = jsonb_build_array(image_url)
where image_url is not null and trim(image_url) <> '' and image_urls = '[]'::jsonb;
alter table public.kegiatan add column if not exists status text not null default 'published'
  check (status in ('draft', 'published', 'archived'));
alter table public.kegiatan add column if not exists updated_at timestamptz not null default now();
alter table public.kegiatan add column if not exists updated_by uuid;

create table if not exists public.pengumuman (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 5000),
  start_date date,
  end_date date,
  pinned boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (start_date is null or end_date is null or end_date >= start_date)
);

-- Pengaturan publik: jangan simpan password / key rahasia di tabel ini.
create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  organization jsonb not null default '{}'::jsonb check (jsonb_typeof(organization) = 'object'),
  donation jsonb not null default '{}'::jsonb check (jsonb_typeof(donation) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.site_settings (id, organization) values
  (1, '{"start_date":"2025-02-16","end_date":"2028-02-16","decree":"001/SK-DKM/II/2025"}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.organization_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  kind text not null check (kind in ('advisor', 'core', 'section', 'unit')),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.organization_groups(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 150),
  role text not null default '' check (length(role) <= 150),
  position integer not null default 0 check (position >= 0),
  is_chair boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists organization_members_group_idx on public.organization_members (group_id, position);
create unique index if not exists organization_one_chair_idx on public.organization_members (is_chair) where is_chair;

-- Audit diisi oleh database, sehingga tidak bergantung pada waktu perangkat admin.
create or replace function public.stamp_content_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.validate_organization_chair() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'organization_members' then
    if new.is_chair and not exists (
      select 1 from public.organization_groups where id = new.group_id and kind = 'core'
    ) then
      raise exception 'Ketua DKM harus berada dalam kelompok Pengurus inti';
    end if;
  elsif new.kind <> 'core' and exists (
    select 1 from public.organization_members where group_id = new.id and is_chair
  ) then
    raise exception 'Kelompok yang memiliki Ketua DKM harus berjenis Pengurus inti';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_chair_member on public.organization_members;
create trigger validate_chair_member before insert or update on public.organization_members
  for each row execute function public.validate_organization_chair();
drop trigger if exists validate_chair_group on public.organization_groups;
create trigger validate_chair_group before update on public.organization_groups
  for each row execute function public.validate_organization_chair();

-- BEGIN MASJID SECURITY (sama dengan migration-admin-security.sql)
create schema if not exists masjid_private;
revoke all on schema masjid_private from public, anon, authenticated;
create table if not exists masjid_private.admin_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table masjid_private.admin_allowlist enable row level security;
revoke all on masjid_private.admin_allowlist from public, anon, authenticated;

-- RPC hanya mengembalikan kewenangan pemanggil, bukan daftar UID.
-- Pemilik function harus tetap role pengelola SQL Editor (postgres).
create or replace function public.is_masjid_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from masjid_private.admin_allowlist where user_id = auth.uid()
  );
$$;
revoke all on function public.is_masjid_admin() from public;
grant execute on function public.is_masjid_admin() to anon, authenticated;

-- Policy permissive digabung dengan OR: policy lama harus dibuang, bukan ditambah saja.
-- Hanya lima tabel konten milik aplikasi ini yang diganti policynya.
do $$
declare table_name text; policy_row record;
begin
  foreach table_name in array array['kegiatan','pengumuman','site_settings','organization_groups','organization_members'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
    execute format('grant insert, update on public.%I to authenticated', table_name);
    for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = table_name loop
      execute format('drop policy %I on public.%I', policy_row.policyname, table_name);
    end loop;
    execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_masjid_admin()))', table_name);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_masjid_admin()))', table_name);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_masjid_admin())) with check ((select public.is_masjid_admin()))', table_name);
    execute format('create policy admin_insert_guard on public.%I as restrictive for insert to anon, authenticated with check ((select public.is_masjid_admin()))', table_name);
    execute format('create policy admin_update_guard on public.%I as restrictive for update to anon, authenticated using ((select public.is_masjid_admin())) with check ((select public.is_masjid_admin()))', table_name);
    execute format('create policy admin_delete_guard on public.%I as restrictive for delete to anon, authenticated using ((select public.is_masjid_admin()))', table_name);
    if table_name <> 'site_settings' then
      execute format('grant delete on public.%I to authenticated', table_name);
      execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_masjid_admin()))', table_name);
    end if;
  end loop;
end;
$$;

create policy public_read on public.kegiatan for select to anon, authenticated using (status = 'published');
create policy public_read on public.pengumuman for select to anon, authenticated using (
  status = 'published'
  and (start_date is null or start_date <= (now() at time zone 'Asia/Jakarta')::date)
  and (end_date is null or end_date >= (now() at time zone 'Asia/Jakarta')::date)
);
create policy public_read on public.site_settings for select to anon, authenticated using (true);
create policy public_read on public.organization_groups for select to anon, authenticated using (true);
create policy public_read on public.organization_members for select to anon, authenticated using (true);

-- Bucket publik tetap dapat dibaca. Semua mutasi memerlukan admin dan folder UID sendiri.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('masjid-media', 'masjid-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Masjid media read" on storage.objects;
create policy "Masjid media read" on storage.objects for select to anon, authenticated using (bucket_id = 'masjid-media');
drop policy if exists "Masjid media upload" on storage.objects;
create policy "Masjid media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'masjid-media' and (select public.is_masjid_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "Masjid media delete" on storage.objects;
create policy "Masjid media delete" on storage.objects for delete to authenticated using (
  bucket_id = 'masjid-media' and (select public.is_masjid_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Guard restrictive menahan policy Storage lama yang mungkin terlalu luas.
-- Bucket lain tidak diubah; UPDATE/upsert masjid-media juga tidak bisa melewati guard.
drop policy if exists "Masjid media insert guard" on storage.objects;
create policy "Masjid media insert guard" on storage.objects as restrictive for insert to anon, authenticated with check (
  bucket_id <> 'masjid-media' or ((select public.is_masjid_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text)
);
drop policy if exists "Masjid media update guard" on storage.objects;
create policy "Masjid media update guard" on storage.objects as restrictive for update to anon, authenticated using (
  bucket_id <> 'masjid-media' or ((select public.is_masjid_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text)
) with check (
  bucket_id <> 'masjid-media' or ((select public.is_masjid_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text)
);
drop policy if exists "Masjid media delete guard" on storage.objects;
create policy "Masjid media delete guard" on storage.objects as restrictive for delete to anon, authenticated using (
  bucket_id <> 'masjid-media' or ((select public.is_masjid_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text)
);
-- END MASJID SECURITY

do $$
declare table_name text;
begin
  foreach table_name in array array['kegiatan','pengumuman','site_settings','organization_groups','organization_members'] loop
    execute format('drop trigger if exists stamp_content_update on public.%I', table_name);
    execute format('create trigger stamp_content_update before insert or update on public.%I for each row execute function public.stamp_content_update()', table_name);
  end loop;
end;
$$;

commit;
