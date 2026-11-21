-- Jalankan sekali di Supabase SQL Editor untuk mengaktifkan galeri foto kegiatan.
-- Foto lama pada image_url tetap dipakai dan tidak dihapus.
alter table public.kegiatan
  add column if not exists image_urls jsonb not null default '[]'::jsonb
  check (jsonb_typeof(image_urls) = 'array');

-- Masukkan foto lama ke daftar galeri tanpa membuat duplikat.
update public.kegiatan
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and trim(image_url) <> ''
  and image_urls = '[]'::jsonb;
