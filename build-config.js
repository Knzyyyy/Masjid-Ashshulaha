// Hasil build siap deploy di public/. Sumber gambar asli tetap ada di index.html.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

function validatePublicConfig(env) {
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (/^sb_secret_/i.test(anonKey) || /service_role/i.test(anonKey)) {
    throw new Error("SUPABASE_ANON_KEY berisi secret/service_role key. Build dibatalkan; gunakan publishable key (sb_publishable_). Nilai key tidak ditulis atau dicetak.");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey)) {
    throw new Error("SUPABASE_ANON_KEY wajib berupa publishable key dengan awalan sb_publishable_. Key kosong, placeholder, anon JWT lama, dan key jenis lain ditolak.");
  }
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw new Error("SUPABASE_URL wajib berupa URL HTTPS proyek Supabase yang valid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("SUPABASE_URL wajib berupa URL HTTPS proyek Supabase tanpa kredensial, query, atau path tambahan.");
  }
  return { url: url.origin, anonKey };
}

async function build() {
  // Validasi dilakukan sebelum mkdir/copy/write. config.js sumber tidak pernah disalin.
  const config = validatePublicConfig(process.env);
  const output = path.join(__dirname, "public");
  const assetDir = path.join(output, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const logoUri = html.match(/<button[^>]*class="brand"[\s\S]*?<img src="(data:image\/png;base64,[^"]+)"/)?.[1];
  if (!logoUri) throw new Error("Logo website tidak ditemukan.");
  const heroUri = html.match(/<img class="bg" src="(data:image\/[^\"]+)"/)?.[1];
  const variants = {};
  const unique = [...new Set(html.match(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/g) || [])];

  for (const uri of unique) {
    const original = Buffer.from(uri.split(",")[1], "base64");
    const image = sharp(original).rotate();
    const meta = await image.metadata();
    const isLogo = uri === logoUri;
    const widths = isLogo ? [160] : uri === heroUri ? [640, 1280, 1920] : [480, 960];
    const files = [];
    for (const width of widths.filter(w => w <= meta.width)) {
      const resized = image.clone().resize({ width, withoutEnlargement: true });
      const buffer = isLogo ? await resized.png({ compressionLevel: 9, palette: true }).toBuffer() : await resized.webp({ quality: 78, effort: 5 }).toBuffer();
      const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
      const name = `${hash}-${width}.${isLogo ? "png" : "webp"}`;
      fs.writeFileSync(path.join(assetDir, name), buffer);
      files.push({ src: `./assets/${name}`, width });
    }
    if (!files.length) throw new Error("Ukuran gambar sumber tidak didukung.");
    const fallback = files.find(f => f.width === 960 || f.width === 1280) || files[0];
    const srcset = files.map(f => `${f.src} ${f.width}w`).join(", ");
    variants[fallback.src] = srcset;
    if (isLogo) fs.copyFileSync(path.join(assetDir, path.basename(fallback.src)), path.join(output, "masjid-logo.png"));
    // Srcset hanya pada elemen HTML; foto kartu memakai manifest di app.js.
    html = html.replaceAll(`src="${uri}"`, `src="${fallback.src}"${isLogo ? ` width="160" height="${Math.round(meta.height * 160 / meta.width)}"` : ` srcset="${srcset}" sizes="${uri === heroUri ? '100vw' : '(max-width: 639px) 100vw, 600px'}"`}`);
    html = html.replaceAll(uri, fallback.src);
  }

  html = html.replace(/<img\b[^>]*>/g, tag => {
    if (/class="bg"/.test(tag)) return tag.replace(/\s*\/>$/, ' fetchpriority="high" decoding="async" />');
    if (!/decoding=/.test(tag)) tag = tag.replace(/\s*\/>$/, ' decoding="async" />');
    if (tag.includes('class="qris-image"') || tag.includes('srcset=') || /class="foot-brand"/.test(tag)) {
      if (!/loading=/.test(tag)) tag = tag.replace(/\s*\/>$/, ' loading="lazy" />');
    }
    return tag;
  });
  // HTML langsung tampil; script defer tetap dijalankan sesuai urutan.
  html = html.replace(/<script>\s*([\s\S]*?)<\/script>/, (_, script) => {
    fs.writeFileSync(path.join(output, "app.js"), `window.MASJID_IMAGE_VARIANTS=${JSON.stringify(variants)};\n${script}`);
    return '<script src="./app.js" defer></script>';
  });
  html = html.replace(/<script src="([^"]+)"(?: defer)?><\/script>/g, '<script src="$1" defer></script>');
  fs.writeFileSync(path.join(output, "index.html"), html);

  for (const file of ["admin.html", "admin.css", "admin-theme.css", "admin.js", "site-content.js", "content-defaults.js", "public-client.js"]) {
    fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
  }
  fs.writeFileSync(path.join(output, "config.js"), `// Konfigurasi publik dari environment; hanya URL dan publishable key.\nwindow.SUPABASE_CONFIG=${JSON.stringify(config)};\n`);
  console.log(`Build selesai: public/index.html ${Math.round(Buffer.byteLength(html) / 1024)} KB; ${unique.length} gambar dipisah dan dioptimalkan.`);
}

module.exports = { validatePublicConfig, build };
if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
