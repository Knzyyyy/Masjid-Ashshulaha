-- ============================================================
-- Skema Supabase — Website Masjid Ash Shulaha
-- Jalankan file ini di Supabase Dashboard > SQL Editor > New query
-- Project: zehzfbtmeasanmlxvhpp (khusus web masjid)
-- ============================================================

create table if not exists public.kegiatan (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Kajian',
  event_date date,
  image_url text,
  created_at timestamptz not null default now()
);

-- Row Level Security aktif
alter table public.kegiatan enable row level security;

-- Baca: siapa pun (pengunjung web) boleh melihat kegiatan
drop policy if exists "Public dapat membaca kegiatan" on public.kegiatan;
create policy "Public dapat membaca kegiatan"
  on public.kegiatan for select
  to anon
  using (true);

-- Tulis: HANYA pengguna yang sudah login (Supabase Auth) yang boleh
-- tambah / ubah / hapus kegiatan. Akun admin dibuat di Supabase
-- Dashboard > Authentication > Users, lalu login di admin.html
-- (signInWithPassword). Pengunjung tanpa login tidak bisa menulis
-- apa pun, meskipun tahu URL admin dan nama tabel.
-- Catatan: policy lama memakai "to anon" — file ini menghapus
-- policy lama tersebut dan menggantinya dengan "to authenticated".
drop policy if exists "Anon dapat menambah kegiatan" on public.kegiatan;
drop policy if exists "Admin dapat menambah kegiatan" on public.kegiatan;
create policy "Admin dapat menambah kegiatan"
  on public.kegiatan for insert
  to authenticated
  with check (true);

drop policy if exists "Anon dapat mengubah kegiatan" on public.kegiatan;
drop policy if exists "Admin dapat mengubah kegiatan" on public.kegiatan;
create policy "Admin dapat mengubah kegiatan"
  on public.kegiatan for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Anon dapat menghapus kegiatan" on public.kegiatan;
drop policy if exists "Admin dapat menghapus kegiatan" on public.kegiatan;
create policy "Admin dapat menghapus kegiatan"
  on public.kegiatan for delete
  to authenticated
  using (true);
