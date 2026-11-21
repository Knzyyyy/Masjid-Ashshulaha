# Masjid Ash Shulaha — Website & Ruang Pengurus

Website statis dengan Supabase untuk database, login pengurus, dan upload gambar.
Hosting menggunakan Vercel. Tidak memerlukan framework atau instalasi dependency aplikasi.

## Fitur

- **Dashboard:** ringkasan kegiatan, pengurus, pengumuman, dan draft.
- **Kegiatan:** tambah, edit, hapus, cari, filter kategori, upload foto, pratinjau, serta status draft/terbit/arsip.
- **Organisasi:** periode, nomor SK, kelompok Penasehat/Pengurus Inti/Seksi/Unit, nama, jabatan, urutan tampil, dan penetapan Ketua DKM.
- **Pengumuman:** teks, sematkan di atas, tanggal mulai/akhir tayang, draft/terbit/arsip, dan pratinjau.
- **Profil & Kontak:** nama masjid, teks beranda, Tentang Kami, foto utama, alamat, WhatsApp, Instagram, YouTube, dan Maps.
- **Donasi & Infak:** aktif/nonaktif, tujuan, bank, nomor rekening, atas nama, dan gambar QRIS.
- **Audit terakhir:** waktu perubahan dari database dan ID akun pengubah; bukan riwayat seluruh revisi.
- **Publik:** membaca konten terbit tanpa memakai sesi login admin. Jadwal sholat tetap otomatis dari Aladhan, metode Kemenag RI.

## Pembaruan dari versi lama

1. Buka Supabase Dashboard proyek masjid → **SQL Editor**.
2. Jalankan **seluruh `schema.sql`**. Kegiatan lama tetap tersimpan dan diberi status `published`. SQL ini menambah tabel, kolom, trigger audit, policy RLS, dan bucket `masjid-media`.
3. Jalankan **`seed.sql`** untuk memasukkan lima kegiatan serta susunan pengurus lama. ID tetap mencegah duplikasi dan data yang sudah diedit tidak ditimpa. Gunakan saat aktivasi awal; menjalankannya lagi dapat mengembalikan data awal yang pernah dihapus.
4. Pastikan **Authentication → Sign In / Providers → Email → Allow new users to sign up** nonaktif. Lokasi pengaturan bisa berbeda sesuai versi dashboard. Semua akun yang berhasil login pada aplikasi ini memiliki akses pengurus; belum ada pembagian admin/editor.
5. Deploy seluruh file terbaru ke Vercel. Environment variable yang sudah ada tetap dapat digunakan.
6. Buka `/admin.html`, login, lalu periksa data kegiatan dan organisasi. Isi profil/donasi sesuai informasi resmi masjid.

File SQL disiapkan untuk dijalankan oleh pemilik proyek. Mengubah file lokal saja tidak memperbarui database Supabase yang sudah online.

## Setup proyek baru

1. Buat proyek Supabase dan jalankan `schema.sql`, lalu `seed.sql`.
2. Di **Authentication → Users → Add user**, buat akun email/password pengurus dengan **Auto Confirm User** aktif.
3. Nonaktifkan public signup seperti langkah pembaruan di atas. Tidak ada formulir pendaftaran akun di website.
4. Ambil **Project URL** dan **Publishable key / anon key** dari pengaturan API Supabase. Jangan gunakan `service_role` atau secret key untuk frontend.

### Lokal

Isi `config.js` dengan URL dan publishable key, lalu:

```sh
npx serve .
```

Buka alamat localhost yang ditampilkan, lalu `/admin.html`. Untuk menghasilkan konfigurasi dari `.env` (Node.js 20.6+):

```sh
node --env-file=.env build-config.js
npx serve .
```

Salin `.env.example` menjadi `.env` dan isi nilainya terlebih dahulu. `.env` tidak dibaca otomatis oleh browser atau `node build-config.js` biasa.

### Vercel

Import repository di Vercel, pilih Framework **Other**, lalu atur:

| Variable | Nilai |
| --- | --- |
| `SUPABASE_URL` | URL proyek Supabase |
| `SUPABASE_ANON_KEY` | Publishable key / anon key proyek |

`vercel.json` menjalankan `node build-config.js` untuk membuat konfigurasi browser dan mengekstrak logo homepage menjadi `masjid-logo.png` untuk admin. Setelah mengganti environment variable, deploy ulang.

## Penggunaan admin

- Login melalui `/admin.html`. Menu ini tidak ditautkan dari website publik.
- Tambah/edit kegiatan dan pengumuman melalui dialog. **Draft** belum tampil, **Terbit** tampil di website, **Arsip** menyembunyikan konten tanpa menghapusnya.
- Pengumuman terbit mengikuti tanggal tayang dalam **WIB**. Tanggal akhir inklusif sampai akhir hari. Tanpa tanggal berarti tidak dibatasi pada sisi tersebut.
- Upload menerima JPG/PNG/WebP maksimal **5 MB**. Upload lebih dahulu, lalu **simpan form** untuk mengaitkan gambar ke konten. Mengganti gambar atau membatalkan form tidak menghapus file lama dari Storage; pengelola dapat membersihkan file tak terpakai melalui Supabase Storage.
- Organisasi memiliki kelompok dan anggota. Urutan lebih kecil tampil lebih dahulu; jika urutan sama, nama menjadi pembanding. Hapus kelompok juga menghapus anggotanya, dengan konfirmasi.
- Ketua DKM hanya satu dan harus berada di kelompok berjenis **Pengurus inti**. Saat pergantian, lepaskan penetapan ketua lama sebelum menetapkan ketua baru.
- Donasi hanya ditampilkan ketika diaktifkan dan tersedia rekening lengkap atau QRIS. Tidak ada rekening/QRIS contoh yang dipublikasikan.
- Klik **Lihat website** lalu muat ulang untuk mengecek hasil. Perubahan dibaca saat halaman publik dimuat; tidak menggunakan realtime subscription.

## Perilaku data & akses

- `anon` hanya membaca kegiatan/pengumuman terbit. Pengumuman juga dibatasi masa tayang oleh RLS.
- `authenticated` membaca dan mengelola konten. Akun dibuat/dinonaktifkan melalui Supabase Dashboard.
- Pengaturan profil, rekening, struktur organisasi, dan gambar bersifat publik. Jangan masukkan informasi rahasia di kolom tersebut.
- Konten kegiatan/organisasi bawaan digunakan saat Supabase belum disetel atau pembacaan gagal. Jika database berhasil dibaca dan isinya kosong, kondisi kosong ditampilkan, sehingga data yang dihapus tidak muncul kembali.
- Nama pengubah ditampilkan sebagai email untuk akun yang sedang login atau potongan UUID untuk akun lain. Daftar email akun Auth tidak dibuka ke publik.
- Upload membutuhkan bucket dan policy dari `schema.sql`. Jika muncul pesan struktur belum lengkap, jalankan SQL terbaru dan gunakan **Coba lagi** atau muat ulang admin.

## File utama

| File | Fungsi |
| --- | --- |
| `index.html` | Website publik, navigasi, kegiatan, jadwal sholat, dan konten bawaan |
| `site-content.js` | Integrasi publik untuk profil, organisasi, pengumuman, dan donasi |
| `admin.html`, `admin.css`, `admin-theme.css`, `admin.js` | Login, dashboard, dan pengelolaan konten |
| `content-defaults.js` | Nilai awal profil/periode/donasi yang dipakai bersama |
| `schema.sql` | Skema, migrasi, RLS, audit, dan bucket gambar |
| `seed.sql` | Data kegiatan dan organisasi awal |
| `config.js`, `build-config.js` | Konfigurasi Supabase browser dan build; logo admin diekstrak saat build |
| `vercel.json` | Konfigurasi deployment |
