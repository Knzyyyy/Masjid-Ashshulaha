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
