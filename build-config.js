// Build step untuk Vercel: hasilkan config.js dari environment variable.
// Dijalankan lewat buildCommand di vercel.json.
// Kalau env var tidak ada (misalnya preview lokal), file config.js
// yang sudah ada dibiarkan apa adanya.
const fs = require("fs");
const path = require("path");

// Pakai gambar logo yang sama dengan navbar website pada halaman admin.
// File PNG dibuat saat build dari data URI yang sudah tertanam di index.html.
const htmlPath = path.join(__dirname, "index.html");
const logoMarker = '<img src="data:image/png;base64,';
const html = fs.readFileSync(htmlPath, "utf8");
const brandStart = html.indexOf('<button type="button" class="brand"');
const logoStart = html.indexOf(logoMarker, brandStart);
if (brandStart !== -1 && logoStart !== -1) {
  const dataStart = logoStart + '<img src="'.length;
  const dataEnd = html.indexOf('"', dataStart);
  const dataUri = html.slice(dataStart, dataEnd);
  const base64 = dataUri.slice("data:image/png;base64,".length);
  const logo = Buffer.from(base64, "base64");
  if (logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    fs.writeFileSync(path.join(__dirname, "masjid-logo.png"), logo);
    console.log("masjid-logo.png dibuat dari logo website.");
  } else {
    throw new Error("Logo Masjid Ash Shulaha di index.html bukan gambar PNG yang valid.");
  }
} else {
  throw new Error("Logo pada navbar index.html tidak ditemukan.");
}

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
