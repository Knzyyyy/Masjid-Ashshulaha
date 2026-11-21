-- Jalankan seluruh file di Supabase SQL Editor, lalu seed.sql.
-- Aman dijalankan ulang pada proyek lama: data kegiatan tidak dihapus.
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

-- Hapus policy kegiatan versi lama sebelum membuat policy baru.
drop policy if exists "Public dapat membaca kegiatan" on public.kegiatan;
drop policy if exists "Anon dapat menambah kegiatan" on public.kegiatan;
drop policy if exists "Anon dapat mengubah kegiatan" on public.kegiatan;
drop policy if exists "Anon dapat menghapus kegiatan" on public.kegiatan;
drop policy if exists "Admin dapat menambah kegiatan" on public.kegiatan;
drop policy if exists "Admin dapat mengubah kegiatan" on public.kegiatan;
drop policy if exists "Admin dapat menghapus kegiatan" on public.kegiatan;

-- Semua akun Auth adalah pengurus. Nonaktifkan public signup di Supabase Auth.
-- SELECT untuk authenticated wajib ada agar admin dapat membaca/mengubah/menghapus.
do $$
declare table_name text;
begin
  foreach table_name in array array['kegiatan','pengumuman','site_settings','organization_groups','organization_members'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
    execute format('grant insert, update, delete on public.%I to authenticated', table_name);
    execute format('drop policy if exists admin_read on public.%I', table_name);
    execute format('create policy admin_read on public.%I for select to authenticated using (true)', table_name);
    execute format('drop policy if exists admin_insert on public.%I', table_name);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check (true)', table_name);
    execute format('drop policy if exists admin_update on public.%I', table_name);
    execute format('create policy admin_update on public.%I for update to authenticated using (true) with check (true)', table_name);
    execute format('drop policy if exists admin_delete on public.%I', table_name);
    -- Baris pengaturan tunggal hanya diedit, bukan dihapus.
    if table_name <> 'site_settings' then
      execute format('create policy admin_delete on public.%I for delete to authenticated using (true)', table_name);
    end if;
    execute format('drop policy if exists public_read on public.%I', table_name);
    execute format('drop trigger if exists stamp_content_update on public.%I', table_name);
    execute format('create trigger stamp_content_update before insert or update on public.%I for each row execute function public.stamp_content_update()', table_name);
  end loop;
end;
$$;

create policy public_read on public.kegiatan for select to anon using (status = 'published');
create policy public_read on public.pengumuman for select to anon using (
  status = 'published'
  and (start_date is null or start_date <= (now() at time zone 'Asia/Jakarta')::date)
  and (end_date is null or end_date >= (now() at time zone 'Asia/Jakarta')::date)
);
create policy public_read on public.site_settings for select to anon using (true);
create policy public_read on public.organization_groups for select to anon using (true);
create policy public_read on public.organization_members for select to anon using (true);

-- Gambar dapat dibaca publik; upload/hapus hanya oleh akun yang login.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('masjid-media', 'masjid-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Masjid media read" on storage.objects;
create policy "Masjid media read" on storage.objects for select to anon, authenticated using (bucket_id = 'masjid-media');
drop policy if exists "Masjid media upload" on storage.objects;
create policy "Masjid media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'masjid-media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Masjid media delete" on storage.objects;
create policy "Masjid media delete" on storage.objects for delete to authenticated using (bucket_id = 'masjid-media');

commit;
