// Build step untuk Vercel: hasilkan config.js dari environment variable.
// Dijalankan lewat buildCommand di vercel.json.
// Kalau env var tidak ada (misalnya preview lokal), file config.js
// yang sudah ada dibiarkan apa adanya.
const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (url && anonKey) {
  const out = [
    "// Dibuat otomatis saat build Vercel dari environment variable.",
    "// Jangan edit manual file hasil build ini; ubah env var di dashboard Vercel.",
    "window.SUPABASE_CONFIG = {",
    "  url: " + JSON.stringify(url) + ",",
    "  anonKey: " + JSON.stringify(anonKey),
    "};",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "config.js"), out);
  console.log("config.js dibuat dari environment variable.");
} else {
  console.log("SUPABASE_URL / SUPABASE_ANON_KEY tidak diset — memakai config.js yang ada.");
}
