// Konfigurasi Supabase untuk website Masjid Ash Shulaha.
// File ini dibaca oleh index.html dan admin.html.
//
// CARA ISI:
// - Lokal: ganti nilai anonKey di bawah dengan publishable key
//   project Supabase (Dashboard > Settings > API > Publishable key).
// - Vercel: JANGAN edit file ini. Isi env var SUPABASE_URL dan
//   SUPABASE_ANON_KEY di dashboard Vercel, lalu deploy ulang.
//   build-config.js akan menimpa file ini saat build dari env var.
// - JANGAN pernah memasukkan service_role key ke file ini.
window.SUPABASE_CONFIG = {
  url: "https://zehzfbtmeasanmlxvhpp.supabase.co",
  anonKey: "ISI_DENGAN_PUBLISHABLE_KEY_ANDA"
};
