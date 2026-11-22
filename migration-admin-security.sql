-- Untuk proyek yang sudah berjalan: jalankan seluruh file di Supabase SQL Editor.
-- Tidak mengubah isi konten dan tidak menjalankan seed.sql.
-- Setelah berhasil, Authentication > Users: salin UID akun admin Anda.
-- Tambahkan HANYA UID tersebut melalui SQL Editor:
-- insert into masjid_private.admin_allowlist (user_id) values ('UID_ADMIN_ANDA'::uuid)
-- on conflict (user_id) do nothing;
-- Allowlist kosong sengaja menolak semua operasi tulis sampai UID admin ditambahkan.
-- Authentication > Sign In / Providers > Email: matikan Allow new users to sign up.
-- Nama/lokasi menu dapat berbeda; pertahankan login Email.
begin;

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

commit;
