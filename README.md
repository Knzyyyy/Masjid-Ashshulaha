# Masjid Ash Shulaha — Website & Ruang Pengurus

Website statis dengan Supabase untuk database, login pengurus, dan upload gambar.
Hosting menggunakan Vercel. Tidak memerlukan framework. Build menggunakan Node.js 22+ dan Sharp untuk mengecilkan gambar; browser tidak mengunduh dependency build.

## Fitur

- **Dashboard:** ringkasan kegiatan, pengurus, pengumuman, dan draft.
- **Kegiatan:** tambah, edit, hapus, cari, filter kategori, galeri hingga 8 foto per kegiatan, pratinjau, serta status draft/terbit/arsip. Foto kartu berganti otomatis dan dapat dibuka sebagai galeri.
- **Organisasi:** periode, nomor SK, kelompok Penasehat/Pengurus Inti/Seksi/Unit, nama, jabatan, urutan tampil, dan penetapan Ketua DKM.
- **Pengumuman:** teks, sematkan di atas, tanggal mulai/akhir tayang, draft/terbit/arsip, dan pratinjau.
- **Profil & Kontak:** nama masjid, teks beranda, Tentang Kami, foto utama, alamat, WhatsApp, Instagram, YouTube, dan Maps.
- **Donasi & Infak:** aktif/nonaktif, tujuan, bank, nomor rekening, atas nama, dan gambar QRIS.
- **Audit terakhir:** waktu perubahan dari database dan ID akun pengubah; bukan riwayat seluruh revisi.
- **Publik:** membaca konten terbit tanpa memakai sesi login admin. Jadwal sholat tetap otomatis dari Aladhan, metode Kemenag RI.

## Pembaruan dari versi lama

1. Buka Supabase Dashboard proyek masjid → **SQL Editor**.
2. Jalankan **seluruh `schema.sql`**. Kegiatan lama tetap tersimpan dan diberi status `published`. SQL ini menambah tabel, kolom, trigger audit, policy RLS, dan bucket `masjid-media`.
   Untuk pembaruan galeri tanpa menjalankan ulang skema penuh, jalankan `migration-activity-gallery.sql`; foto tunggal yang lama akan masuk ke daftar galeri.
3. Jalankan **`seed.sql`** untuk memasukkan lima kegiatan serta susunan pengurus lama. ID tetap mencegah duplikasi dan data yang sudah diedit tidak ditimpa. Gunakan saat aktivasi awal; menjalankannya lagi dapat mengembalikan data awal yang pernah dihapus.
4. Terapkan pembatasan UID admin mengikuti bagian **Pengamanan admin pada proyek yang sudah berjalan** di bawah. Login saja tidak memberikan kewenangan admin.
5. Deploy seluruh file terbaru ke Vercel setelah review diff dan konfigurasi publishable key.
6. Buka `/admin.html`, login, lalu periksa data kegiatan dan organisasi. Isi profil/donasi sesuai informasi resmi masjid.

File SQL disiapkan untuk dijalankan oleh pemilik proyek. Mengubah file lokal saja tidak memperbarui database Supabase yang sudah online.

## Pengamanan admin pada proyek yang sudah berjalan

1. Di **Authentication → Users**, pilih akun admin Anda dan salin **User UID**. Tidak perlu menyimpan email atau password akun tersebut dalam kode. Sesi coding ini tidak memiliki akses pengelolaan Supabase Auth untuk mengambil UID otomatis.
2. Di **SQL Editor**, jalankan seluruh `migration-admin-security.sql`. Jangan menjalankan ulang `seed.sql` untuk pembaruan keamanan. Migrasi mempertahankan konten; allowlist yang kosong sengaja menolak semua operasi tulis.
3. Masih di SQL Editor, ganti placeholder berikut dengan UID yang tadi disalin, lalu jalankan. Masukkan **hanya akun admin Anda**:

   ```sql
   insert into masjid_private.admin_allowlist (user_id)
   values ('UID_ADMIN_ANDA'::uuid)
   on conflict (user_id) do nothing;
   ```

4. **Authentication → Sign In / Providers → Email**: nonaktifkan **Allow new users to sign up**. Nama/lokasi pengaturan dapat berbeda, misalnya pada Settings. Tetap aktifkan login Email agar akun yang sudah ada dapat masuk. Menonaktifkan signup tidak menggantikan pemeriksaan allowlist; akun lama lain tetap tidak mendapat izin tulis.
5. Pastikan `masjid_private` **tidak** ditambahkan ke daftar exposed schemas pada pengaturan Data API. Allowlist hanya dikelola pemilik proyek melalui SQL Editor, tidak melalui akun login website. RPC `is_masjid_admin()` hanya mengembalikan boolean untuk pemanggil saat ini.
6. Di **Vercel → Project → Settings → Environment Variables**, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` untuk environment deployment yang dipakai. Key wajib diawali **`sb_publishable_`**. Secret key, service-role key, anon JWT lama, dan placeholder ditolak sebelum build menulis file. Source `config.js` tidak digunakan sebagai fallback build.
7. Review `git diff` termasuk file baru, lalu lakukan deployment setelah persetujuan. Migrasi database dan pendaftaran UID harus selesai sebelum memakai Admin hasil deployment baru. Perubahan lokal tidak otomatis memodifikasi Supabase atau deployment Production.

Setelah deployment, periksa: admin yang didaftarkan dapat mengelola konten dan mengunggah foto; akun lain ditolak dari dashboard serta operasi tulis; pengunjung tetap dapat membaca konten terbit. Pengujian otomatis lokal tersedia melalui `npm run test:security`; pengujian memakai database PostgreSQL lokal dan identitas uji, bukan proyek production. Tes build menghasilkan konfigurasi fiktif di `public/`; build ulang dengan environment Anda sebelum preview atau deployment manual.

Untuk mencabut kewenangan akun, hapus UID-nya dari `masjid_private.admin_allowlist` melalui SQL Editor. Izin RLS langsung dicabut; Admin juga memeriksa ulang user dan izin sebelum simpan, hapus, serta setiap upload. Jika mengganti akun admin, perhatikan bahwa file Storage lama tetap dimiliki folder UID lama; tidak otomatis boleh dihapus akun baru.

## Setup proyek baru

1. Buat proyek Supabase dan jalankan `schema.sql`, lalu `seed.sql`.
2. Di **Authentication → Users → Add user**, buat akun email/password pengurus dengan **Auto Confirm User** aktif.
3. Tambahkan UID akun tersebut ke allowlist dan nonaktifkan public signup mengikuti langkah pengamanan di atas. Tidak ada formulir pendaftaran akun di website.
4. Ambil **Project URL** dan **Publishable key** dengan awalan `sb_publishable_` dari pengaturan API Supabase. Jangan gunakan `service_role`, secret key, atau anon JWT lama untuk build frontend.

### Lokal

Salin `.env.example` menjadi `.env` yang tidak di-commit. Isi URL proyek dan publishable key di `.env`, biarkan source `config.js` tetap berisi placeholder, lalu:

```sh
npm install
node --env-file=.env build-config.js
npx serve public
```

Buka alamat localhost yang ditampilkan, lalu `/admin.html`. `.env` tidak dibaca otomatis oleh browser atau `npm run build` biasa; gunakan `--env-file=.env` seperti di atas, atau set kedua environment variable di shell. Build sengaja gagal jika key tidak valid. Jangan memasukkan email admin, password, atau secret key ke file sumber.

### Vercel

Import repository di Vercel, pilih Framework **Other**, lalu atur:

| Variable | Nilai |
| --- | --- |
| `SUPABASE_URL` | URL proyek Supabase |
| `SUPABASE_ANON_KEY` | Publishable key proyek, wajib `sb_publishable_` |

`vercel.json` menjalankan `npm run build` dan menerbitkan folder `public/`. Build memisahkan gambar tertanam menjadi PNG/WebP dengan ukuran responsif, membuat logo kecil untuk admin, dan memisahkan JavaScript agar HTML cepat tampil. Nama aset mengikuti hash isinya sehingga aman di-cache selama setahun. Setelah mengganti environment variable atau sumber gambar, build dan deploy ulang. Folder `public/` dihasilkan otomatis dan tidak perlu di-commit.

Sumber `index.html` menyimpan gambar asli untuk build; untuk menguji performa, selalu buka hasil build melalui `npx serve public`. Melayani direktori sumber langsung tetap membawa data gambar asli yang besar.

## Penggunaan admin

- Login melalui `/admin.html`. Menu ini tidak ditautkan dari website publik.
- Dashboard dibuka setelah `auth.getUser()` dan RPC kewenangan berhasil. Akun yang tidak tercantum dalam allowlist mendapat pesan akses ditolak. Pemeriksaan frontend membantu pengguna; policy database/Storage tetap menolak permintaan langsung yang tidak berwenang.
- Tambah/edit kegiatan dan pengumuman melalui dialog. Kegiatan dapat memuat hingga 8 foto; kartu berganti foto otomatis setiap 5 detik dan fotonya dapat dibuka dalam galeri. **Draft** belum tampil, **Terbit** tampil di website, **Arsip** menyembunyikan konten tanpa menghapusnya.
- Pengumuman terbit mengikuti tanggal tayang dalam **WIB**. Tanggal akhir inklusif sampai akhir hari. Tanpa tanggal berarti tidak dibatasi pada sisi tersebut.
- Upload menerima JPG/PNG/WebP maksimal **5 MB per foto**. Upload lebih dahulu, lalu **simpan form** untuk mengaitkan gambar ke konten. Mengganti gambar atau membatalkan form tidak menghapus file lama dari Storage; pengelola dapat membersihkan file tak terpakai melalui Supabase Storage.
- Foto kegiatan dan foto beranda baru otomatis dikecilkan ke sisi terpanjang 1600 px dan WebP jika hasilnya lebih ringan. QRIS dipertahankan utuh. Foto yang sudah tersimpan sebelumnya tidak diubah; unggah ulang jika ingin mengecilkannya.
- Organisasi memiliki kelompok dan anggota. Urutan lebih kecil tampil lebih dahulu; jika urutan sama, nama menjadi pembanding. Hapus kelompok juga menghapus anggotanya, dengan konfirmasi.
- Ketua DKM hanya satu dan harus berada di kelompok berjenis **Pengurus inti**. Saat pergantian, lepaskan penetapan ketua lama sebelum menetapkan ketua baru.
- Donasi hanya ditampilkan ketika diaktifkan dan tersedia rekening lengkap atau QRIS. Tidak ada rekening/QRIS contoh yang dipublikasikan.
- Klik **Lihat website** lalu muat ulang untuk mengecek hasil. Perubahan dibaca saat halaman publik dimuat; tidak menggunakan realtime subscription.

## Perilaku data & akses

- `anon` hanya membaca kegiatan/pengumuman terbit. Pengumuman juga dibatasi masa tayang oleh RLS.
- `authenticated` yang UID-nya ada di allowlist dapat membaca draft dan mengelola konten; akun login lain hanya dapat membaca konten publik. Izin TRUNCATE/REFERENCES/TRIGGER tidak diberikan ke role browser. Baris pengaturan tunggal tetap tidak dapat dihapus dari akun website.
- Storage `masjid-media` dapat dibaca publik. Upload/delete memerlukan admin dan folder pertama yang sama dengan UID pemanggil. Guard restrictive juga menahan policy Storage lama yang terlalu longgar, termasuk pada UPDATE/upsert; policy bucket lain tidak diubah.
- Pengaturan profil, rekening, struktur organisasi, dan gambar bersifat publik. Jangan masukkan informasi rahasia di kolom tersebut.
- Konten kegiatan/organisasi bawaan digunakan saat Supabase belum disetel atau pembacaan gagal. Jika database berhasil dibaca dan isinya kosong, kondisi kosong ditampilkan, sehingga data yang dihapus tidak muncul kembali.
- Nama pengubah ditampilkan sebagai email untuk akun yang sedang login atau potongan UUID untuk akun lain. Daftar email akun Auth tidak dibuka ke publik.
- Upload membutuhkan bucket dan policy dari `schema.sql`. Jika muncul pesan struktur belum lengkap, jalankan SQL terbaru dan gunakan **Coba lagi** atau muat ulang admin.

## File utama

| File | Fungsi |
| --- | --- |
| `index.html` | Website publik, navigasi, kegiatan, jadwal sholat, dan konten bawaan |
| `site-content.js` | Integrasi publik untuk profil, organisasi, pengumuman, dan donasi |
| `public-client.js` | Pembacaan REST anonim tanpa memuat SDK autentikasi di website publik |
| `admin.html`, `admin.css`, `admin-theme.css`, `admin.js` | Login, dashboard, dan pengelolaan konten |
| `content-defaults.js` | Nilai awal profil/periode/donasi yang dipakai bersama |
| `schema.sql` | Skema, migrasi, RLS, audit, dan bucket gambar |
| `migration-admin-security.sql` | Migrasi keamanan proyek aktif tanpa mengubah isi konten atau menjalankan seed |
| `tests/security.test.cjs` | Pengujian key build, izin RLS, allowlist, dan kepemilikan Storage |
| `seed.sql` | Data kegiatan dan organisasi awal |
| `config.js`, `build-config.js` | Konfigurasi Supabase browser dan build; logo admin diekstrak saat build |
| `vercel.json` | Konfigurasi deployment |
