-- ============================================================
-- Data awal (seed) — 5 kegiatan yang sama dengan versi statis
-- Jalankan SETELAH schema.sql. Aman dijalankan berulang kali
-- (ON CONFLICT DO NOTHING berdasarkan id yang tetap).
-- event_date dibiarkan NULL seperti di versi lama: kegiatan ini
-- adalah program rutin DKM, jadi di web tampil sebagai
-- "Program rutin DKM". Isi tanggalnya lewat halaman admin
-- kalau kegiatan sudah punya tanggal pasti.
-- image_url NULL: foto kegiatan lama menempel di file statis
-- (base64), bukan URL. Untuk kegiatan baru, isi dengan URL
-- gambar (misalnya dari Supabase Storage).
-- ============================================================

begin;

insert into public.kegiatan (id, title, description, category, event_date, image_url) values
  ('11111111-1111-4111-8111-111111111111',
   'Sholat Idul Fitri & Halal Bihalal',
   'Sholat Idul Fitri berjamaah dilanjutkan halal bihalal bersama warga Jatimurni. Jamaah diimbau datang lebih awal dan membawa sajadah masing-masing.',
   'Idul Fitri', null, null),
  ('22222222-2222-4222-8222-222222222222',
   'Penyembelihan Hewan Kurban Idul Adha',
   'Penyembelihan dan pembagian daging kurban Idul Adha untuk warga sekitar masjid. Pendaftaran hewan kurban dibuka melalui pengurus DKM.',
   'Idul Adha', null, null),
  ('33333333-3333-4333-8333-333333333333',
   'Kajian Rutin Pekanan',
   'Kajian rutin terbuka untuk umum di ruang utama masjid. Mari meramaikan majelis ilmu dan mempererat ukhuwah antarjamaah.',
   'Kajian', null, null),
  ('44444444-4444-4444-8444-444444444444',
   'Pembinaan Remaja Masjid',
   'Kegiatan pembinaan dan diskusi remaja masjid Ash Shulaha: wadah anak muda untuk belajar, berorganisasi, dan berkontribusi untuk masjid.',
   'Remaja', null, null),
  ('55555555-5555-4555-8555-555555555555',
   'Bakti Sosial & Santunan',
   'Bakti sosial DKM Ash Shulaha: pembagian paket sembako dan santunan untuk warga yang membutuhkan di lingkungan Jatimurni dan sekitarnya.',
   'Sosial', null, null)
on conflict (id) do nothing;

-- Susunan awal dari website. UUID tetap: eksekusi ulang tidak menimpa hasil edit.
-- Jalankan saat aktivasi pertama; seed yang diulang dapat mengembalikan data awal
-- yang sudah dihapus. Tidak diperlukan untuk pemakaian admin sehari-hari.
insert into public.organization_groups (id, name, kind, position) values
  ('a0000000-0000-4000-8000-000000000001', 'Penasehat', 'advisor', 1),
  ('a0000000-0000-4000-8000-000000000002', 'Pengurus Inti', 'core', 2),
  ('a0000000-0000-4000-8000-000000000003', 'Seksi Sosial', 'section', 3),
  ('a0000000-0000-4000-8000-000000000004', 'Seksi PHBI', 'section', 4),
  ('a0000000-0000-4000-8000-000000000005', 'Seksi Pribadatan', 'section', 5),
  ('a0000000-0000-4000-8000-000000000006', 'Seksi Yadhu', 'section', 6),
  ('a0000000-0000-4000-8000-000000000007', 'Seksi Sound, Listrik, Medsos', 'section', 7),
  ('a0000000-0000-4000-8000-000000000008', 'Seksi Sosial', 'section', 8),
  ('a0000000-0000-4000-8000-000000000009', 'MT. Al Hasanah', 'unit', 9),
  ('a0000000-0000-4000-8000-000000000010', 'Marbot', 'unit', 10),
  ('a0000000-0000-4000-8000-000000000011', 'Kurma', 'unit', 11)
on conflict (id) do nothing;

with initial_members (group_id, names, roles) as (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, array['H. Gunawan','H. Thamarudin','H. Taufik Barkan'], array['Penasehat','Penasehat','Penasehat']),
  ('a0000000-0000-4000-8000-000000000002'::uuid, array['H. Opa Sutiana','H. Didit Siswodwiatmoko','Ustad Abdullah Tehuayo','Djohan Kadhafi'], array['Ketua DKM','Wakil Ketua','Sekretaris','Bendahara']),
  ('a0000000-0000-4000-8000-000000000003'::uuid, array['Fadil Ramadhan','Tengku Reyhan','Ade Robi'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000004'::uuid, array['Deden Permana','Fajar Kardiman','Farid'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000005'::uuid, array['Ust. H. Abdurahman Muhtar','Ust. Delta Waskita','Ust. Iwan Kurniawan','Ust. Abdul Muhit'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000006'::uuid, array['H. Listiati Hariyanto','Ibu Sri Hayati','Ibu Devi Yuliani Erwan'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000007'::uuid, array['Febry Wahyu Adithya','Sedo Nully Justitia','Fadhil Saputro','Fadjri Saputro'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000008'::uuid, array['H. Mal Frisdi','Oha Bin Odik','Rala Abdulah'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000009'::uuid, array['H. Nurmawati Anton','H. Listiati Hariyanto','H. Triwidyawati Dwi Ari Adi'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000010'::uuid, array['Ust. Abdul Muhit','Ust. Iwan Kurniawan'], array[]::text[]),
  ('a0000000-0000-4000-8000-000000000011'::uuid, array['Fadlan Harish'], array[]::text[])
)
insert into public.organization_members (id, group_id, name, role, position, is_chair)
select md5(group_id::text || ':' || member.ordinality::text)::uuid,
  group_id, member.name, coalesce(roles[member.ordinality::int], 'Anggota'), member.ordinality::int,
  group_id = 'a0000000-0000-4000-8000-000000000002'::uuid and member.ordinality = 1
from initial_members, unnest(names) with ordinality as member(name, ordinality)
-- Jangan memunculkan ketua awal lagi jika ketua lain sudah ditetapkan.
where not exists (select 1 from public.organization_members existing
  where existing.id = md5(initial_members.group_id::text || ':' || member.ordinality::text)::uuid)
and not (group_id = 'a0000000-0000-4000-8000-000000000002'::uuid and member.ordinality = 1
  and exists (select 1 from public.organization_members where is_chair))
on conflict (id) do nothing;

commit;
