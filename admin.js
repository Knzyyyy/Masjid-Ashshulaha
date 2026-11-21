/* Ruang Pengurus — Supabase Auth, konten, organisasi, dan media. */
(function () {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const categories = ["Kajian", "Idul Fitri", "Idul Adha", "Remaja", "Sosial"];
  const kinds = { advisor: "Penasehat", core: "Pengurus inti", section: "Seksi", unit: "Unit & pelaksana" };
  const titles = { dashboard: "Dashboard", kegiatan: "Kegiatan", organisasi: "Organisasi", pengumuman: "Pengumuman", profil: "Profil & Kontak", donasi: "Donasi & Infak" };
  const state = { user: null, view: "dashboard", activities: [], announcements: [], groups: [], members: [], settings: null, ready: {}, errors: [], busy: false, uploads: 0, loading: false };
  let client, editor = null, editorDirty = false, settingsDirty = new Set(), toastTimer, authVersion = 0;
  const defaults = window.MASJID_DEFAULTS;
  // Logo PNG kecil dihasilkan saat build dari gambar pada navbar homepage.
  // Bila halaman dibuka lewat static server lokal tanpa build, ambil logo dari HTML homepage.
  function loadBrandLogo() {
    const apply = (src) => {
      if (!src) return;
      $$(".brand-logo").forEach(img => {
        img.addEventListener("load", () => { img.hidden = false; }, { once: true });
        img.addEventListener("error", () => { img.hidden = true; }, { once: true });
        img.src = src;
      });
    };
    fetch("./masjid-logo.png", { cache: "force-cache" }).then(response => {
      if (!response.ok) throw new Error("Logo hasil build tidak tersedia");
      return response.blob();
    }).then(blob => apply(URL.createObjectURL(blob))).catch(() => {
      fetch("./index.html", { cache: "force-cache" }).then(response => response.text()).then(html => {
        const homepage = new DOMParser().parseFromString(html, "text/html");
        const src = homepage.querySelector("button.brand img")?.getAttribute("src");
        if (src) apply(new URL(src, new URL("./index.html", location.href)).href);
      }).catch(() => {});
    });
  }
  const fmtDate = (date, withTime = false) => {
    if (!date) return "Program rutin";
    const value = new Date(date.length === 10 ? date + "T00:00:00+07:00" : date);
    return Number.isNaN(value.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(value);
  };
  function safeUrl(value) {
    try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; }
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    const el = $("#toast"); el.textContent = message; el.className = "toast" + (error ? " error" : ""); el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 4000);
  }
  function message(error) {
    const msg = error?.message || String(error);
    if (/relation|schema cache|column|does not exist|bucket not found/i.test(msg)) return "Struktur data belum lengkap. Jalankan schema.sql terbaru di SQL Editor Supabase, lalu muat ulang admin.";
    return msg;
  }
  function throwError(res) { if (res.error) throw res.error; return res.data; }
  function settings(section) { return { ...defaults[section], ...(state.settings?.[section] || {}) }; }
  function audit(row) {
    if (!row?.updated_at) return "";
    const who = row.updated_by ? (row.updated_by === state.user?.id ? state.user.email : "akun " + row.updated_by.slice(0, 8)) : "pengurus";
    return `<p class="audit">Terakhir diperbarui ${esc(fmtDate(row.updated_at, true))} · ${esc(who)}</p>`;
  }
  function thumbnail(url, className = "") {
    const safe = safeUrl(url);
    return `<span class="thumb ${className}">${safe ? `<img src="${esc(safe)}" alt="" loading="lazy" />` : icon("image")}</span>`;
  }
  function statusBadge(status) {
    const labels = { published: "Terbit", draft: "Draft", archived: "Arsip" };
    return `<span class="badge ${status === "published" ? "published" : status === "draft" ? "draft" : "expired"}">${status === "published" ? '<span class="live-dot"></span>' : ""}${labels[status] || "Terbit"}</span>`;
  }
  function empty(title, description, action = "", label = "Tambah data", type = "calendar") {
    return `<div class="empty-state">${icon(type)}<h3>${esc(title)}</h3><p>${esc(description)}</p>${action ? `<button type="button" class="button secondary" data-action="${action}">${icon("plus")}${esc(label)}</button>` : ""}</div>`;
  }
  function heading(eyebrow, title, note, action = "", label = "Tambah") {
    return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${note}</p></div>${action ? `<button class="button primary" data-action="${action}" type="button">${icon("plus")}${label}</button>` : ""}</div>`;
  }
  function setSidebar(open) {
    $("#sidebar").classList.toggle("open", open); $("#sidebarShade").hidden = !open;
    $("#menuBtn").setAttribute("aria-expanded", String(open));
    $("#menuBtn").setAttribute("aria-label", open ? "Tutup navigasi" : "Buka navigasi");
  }
  async function confirmAction(title, text, action = "Ya, hapus") {
    if ($("#confirmDialog").open) return false;
    $("#confirmTitle").textContent = title; $("#confirmText").textContent = text; $("#confirmAction").textContent = action;
    const dialog = $("#confirmDialog"); dialog.returnValue = "";
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
  }
  async function navigate(view) {
    if (!titles[view]) return;
    if (settingsDirty.size && !await confirmAction("Tinggalkan perubahan?", "Ada perubahan pengaturan yang belum disimpan.", "Tinggalkan")) return;
    settingsDirty.clear();
    state.view = view;
    $$(".view").forEach(el => { el.hidden = el.id !== "view-" + view; });
    $$(".side-nav [data-view]").forEach(el => { const active = el.dataset.view === view; el.classList.toggle("active", active); if (active) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
    $("#breadcrumbTitle").textContent = titles[view]; document.title = titles[view] + " — Ruang Pengurus";
    setSidebar(false); renderView(view); window.scrollTo({ top: 0, behavior: "instant" });
    $("#mainContent").focus({ preventScroll: true });
  }
  function renderDashboard() {
    const published = state.activities.filter(r => r.status === "published").length;
    const drafts = state.activities.filter(r => r.status === "draft").length + state.announcements.filter(r => r.status === "draft").length;
    const stats = [
      ["Total kegiatan", state.activities.length, `${published} kegiatan terbit`, "calendar"],
      ["Pengurus masjid", state.members.length, `${state.groups.length} kelompok organisasi`, "users"],
      ["Pengumuman", state.announcements.length, `${state.announcements.filter(isLive).length} sedang ditayangkan`, "megaphone"],
      ["Draft konten", drafts, "Siap dilengkapi & diterbitkan", "edit"]
    ];
    const recent = state.activities.slice().sort((a,b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)).slice(0, 4);
    $("#view-dashboard").innerHTML = heading("SELAMAT DATANG KEMBALI", "Assalamu’alaikum, Pengurus.", "Semoga setiap langkah hari ini menjadi kebaikan untuk jamaah.") +
      `<div class="welcome-banner"><div class="welcome-content"><span class="eyebrow">MASJID ASH SHULAHA · JATIMURNI</span><h2>Masjid yang hidup,<br />dimulai dari kabar yang baik.</h2><p>Kelola kegiatan dan informasi masjid. Bantu jamaah tetap dekat dengan setiap kabar terbaru.</p><button type="button" class="button lime" data-action="add-activity">${icon("plus")}Buat kegiatan baru</button></div><div class="welcome-art" aria-hidden="true">${icon("mosque")}</div></div>` +
      `<div class="stats-grid">${stats.map(([label, value, foot, name]) => `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(name)}</span></div><p class="stat-value">${state.loading ? "—" : value}</p><p class="stat-foot">${foot}</p></div>`).join("")}</div>` +
      `<div class="dashboard-columns"><div class="card"><div class="card-header"><div><h2>Kegiatan terbaru</h2><p>Kabar yang terakhir dikelola</p></div><button class="text-link icon-button-text" data-view="kegiatan" type="button">Lihat semua ${icon("arrow")}</button></div>${recent.length ? recent.map(r => `<div class="recent-item">${thumbnail(r.image_url)}<div class="recent-item-content"><h3>${esc(r.title)}</h3><p>${esc(r.category)} <span aria-hidden="true">·</span> ${esc(fmtDate(r.event_date))}</p></div>${statusBadge(r.status)}<button type="button" class="icon-button" data-action="edit-activity" data-id="${r.id}" aria-label="Ubah ${esc(r.title)}">${icon("arrow")}</button></div>`).join("") : empty("Belum ada kegiatan", "Mulai bagikan agenda dan kabar baik masjid.", "add-activity", "Buat kegiatan")}</div><div class="dashboard-aside"><div class="card"><div class="card-header"><h2>Akses cepat</h2></div><div class="quick-actions">${[["add-announcement","megaphone","Tulis pengumuman","Sampaikan informasi untuk jamaah"],["view-organisasi","users","Kelola pengurus","Perbarui struktur organisasi"],["view-donasi","heart","Informasi infak","Kelola rekening dan QRIS"]].map(([action, ic, label, note]) => `<button type="button" class="quick-action" data-action="${action}"><span class="quick-icon">${icon(ic)}</span><span><strong>${label}</strong><small>${note}</small></span>${icon("arrow")}</button>`).join("")}</div></div><div class="tip-card"><span class="eyebrow">PENGINGAT KECIL</span><h3>Informasi tepat,<br />jamaah lebih dekat.</h3><p>Periksa tanggal, foto, dan kontak sebelum menerbitkan konten. Gunakan draft untuk menyimpan tulisan yang belum selesai.</p><a class="text-link" href="./index.html" target="_blank" rel="noopener">Kunjungi website ${icon("arrow")}</a></div></div></div>`;
  }
  function isLive(row) { const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date()); return row.status === "published" && (!row.start_date || row.start_date <= today) && (!row.end_date || row.end_date >= today); }
  function renderList(type) {
    const activity = type === "activity", view = activity ? "kegiatan" : "pengumuman";
    $("#view-" + view).innerHTML = heading("KONTEN MASJID", activity ? "Kegiatan masjid" : "Pengumuman jamaah", activity ? "Kelola agenda, program rutin, dan dokumentasi kegiatan." : "Bagikan informasi penting dengan masa tayang yang teratur.", "add-" + type, activity ? "Tambah kegiatan" : "Tulis pengumuman") +
      `<div class="card"><div class="toolbar"><label class="search-field" style="margin:0">${icon("search")}<input type="search" data-list-search="${type}" aria-label="Cari ${view}" placeholder="Cari ${view}…" /></label><div class="toolbar-filters">${activity ? `<select class="filter-select" data-category-filter aria-label="Filter kategori"><option value="">Semua kategori</option>${categories.map(c => `<option>${c}</option>`).join("")}</select>` : ""}<select class="filter-select" data-status-filter="${type}" aria-label="Filter status"><option value="">Semua status</option><option value="published">Terbit</option><option value="draft">Draft</option><option value="archived">Arsip</option></select></div></div><div class="table-scroll" data-list-body="${type}"></div><div class="list-footer" data-list-count="${type}"></div></div>`;
    renderListRows(type);
  }
  function renderListRows(type) {
    const activity = type === "activity", root = $("#view-" + (activity ? "kegiatan" : "pengumuman"));
    const query = $("[data-list-search]", root).value.trim().toLowerCase();
    const status = $("[data-status-filter]", root).value, category = $("[data-category-filter]", root)?.value;
    const source = activity ? state.activities : state.announcements;
    const rows = source.filter(r => (!query || (r.title + " " + (r.description || r.body || "")).toLowerCase().includes(query)) && (!status || r.status === status) && (!category || r.category === category));
    $("[data-list-body]", root).innerHTML = rows.length ? `<table><thead><tr><th>${activity ? "Kegiatan" : "Pengumuman"}</th><th class="optional-column">${activity ? "Tanggal" : "Masa tayang"}</th><th>Status</th><th style="text-align:right">Aksi</th></tr></thead><tbody>${rows.map(r => `<tr><td><div class="content-cell">${activity ? thumbnail(r.image_url) : ""}<div><strong>${esc(r.title)}</strong><small>${activity ? esc(r.category) : (r.pinned ? "Disematkan · " : "") + (isLive(r) ? "Sedang tayang" : "Tidak sedang tayang")}</small></div></div></td><td class="optional-column">${activity ? esc(fmtDate(r.event_date)) : `${r.start_date ? esc(fmtDate(r.start_date)) : "Mulai saat terbit"}<br /><span class="muted">${r.end_date ? "s/d " + esc(fmtDate(r.end_date)) : "Tanpa batas akhir"}</span>`}</td><td>${statusBadge(r.status)}</td><td><div class="row-actions"><button type="button" class="icon-button" data-action="edit-${type}" data-id="${r.id}" aria-label="Ubah ${esc(r.title)}">${icon("edit")}</button><button type="button" class="icon-button delete" data-action="delete-${type}" data-id="${r.id}" aria-label="Hapus ${esc(r.title)}">${icon("trash")}</button></div></td></tr>`).join("")}</tbody></table>` : empty(source.length ? "Tidak ada hasil" : "Belum ada " + (activity ? "kegiatan" : "pengumuman"), source.length ? "Coba kata kunci atau filter yang berbeda." : "Tambahkan konten pertama untuk dibagikan kepada jamaah.", source.length ? "" : "add-" + type, "Tambah " + (activity ? "kegiatan" : "pengumuman"), activity ? "calendar" : "megaphone");
    $("[data-list-count]", root).textContent = `Menampilkan ${rows.length} dari ${source.length} ${activity ? "kegiatan" : "pengumuman"}`;
  }
  function field(name, label, value = "", options = {}) {
    const attributes = `${options.required ? " required" : ""}${options.max ? ` maxlength="${options.max}"` : ""}${options.min !== undefined ? ` min="${options.min}"` : ""}${options.step ? ` step="${options.step}"` : ""}`;
    let input;
    if (options.textarea) input = `<textarea name="${name}"${attributes}>${esc(value)}</textarea>`;
    else if (options.choices) input = `<select name="${name}"${attributes}>${options.choices.map(c => { const [v,t] = Array.isArray(c) ? c : [c,c]; return `<option value="${esc(v)}"${String(value) === String(v) ? " selected" : ""}>${esc(t)}</option>`; }).join("")}</select>`;
    else input = `<input name="${name}" type="${options.type || "text"}" value="${esc(value)}"${attributes}${options.placeholder ? ` placeholder="${esc(options.placeholder)}"` : ""} />`;
    return `<label>${label}${input}${options.hint ? `<span class="hint">${options.hint}</span>` : ""}</label>`;
  }
  function checkbox(name, label, checked, hint = "") { return `<label class="checkbox-label"><input name="${name}" type="checkbox"${checked ? " checked" : ""} /><span>${label}${hint ? `<span class="hint">${hint}</span>` : ""}</span></label>`; }
  function imagePicker(name, value, label = "Foto kegiatan") {
    return `<div class="image-picker"><img class="image-preview" data-image-preview="${name}" alt="Pratinjau gambar" ${safeUrl(value) ? `src="${esc(safeUrl(value))}"` : "hidden"} /><label>${label}<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${name}" /><span class="hint">JPG, PNG, atau WebP. Maksimal 5 MB.</span></label><span class="upload-state" data-upload-state="${name}" role="status"></span><p class="upload-or">Atau gunakan tautan gambar yang sudah tersedia</p>${field(name, "URL gambar", value, {type:"url",hint:"Kosongkan URL untuk menghapus gambar dari konten."})}</div>`;
  }
  function activityImagePicker(row) {
    const images = Array.isArray(row.image_urls) ? row.image_urls.filter(url => safeUrl(url)) : [];
    const legacy = safeUrl(row.image_url);
    if (legacy && !images.includes(legacy)) images.unshift(legacy);
    return `<div class="image-picker activity-image-picker"><label>Foto kegiatan<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="activity_images" multiple /><span class="hint">Pilih beberapa JPG, PNG, atau WebP sekaligus. Maksimal 8 foto, masing-masing 5 MB.</span></label><span class="upload-state" data-upload-state="activity_images" role="status"></span><div class="activity-image-list" data-activity-image-list>${images.map((url,index) => `<div class="activity-image-item"><img src="${esc(url)}" alt="Pratinjau foto ${index + 1}" /><button type="button" class="button secondary" data-remove-activity-image="${index}" aria-label="Hapus foto ${index + 1}">Hapus</button></div>`).join("")}</div><input type="hidden" name="image_urls" value="${esc(JSON.stringify(images))}" />${field("image_url","Atau tambahkan URL foto",legacy,{type:"url",hint:"URL ini ikut masuk sebagai salah satu foto. Kosongkan untuk menghapus URL lama."})}</div>`;
  }
  function renderOrganization() {
    const org = settings("organization");
    $("#view-organisasi").innerHTML = heading("KEPENGURUSAN DKM", "Organisasi masjid", "Kelola susunan pengurus, kelompok, dan periode kepengurusan.") +
      `<form class="card org-settings" data-settings="organization"><h2 class="form-section-title">Periode kepengurusan</h2><p class="form-section-note">Informasi ini tampil di atas bagan organisasi website.</p><div class="form-row">${field("start_date","Mulai periode",org.start_date,{type:"date",required:true})}${field("end_date","Akhir periode",org.end_date,{type:"date",required:true})}${field("decree","Nomor surat / SK",org.decree,{max:150})}</div><div class="settings-footer"><p>Pengurus dan kelompok disimpan melalui form masing-masing.</p><button class="button primary" type="submit">Simpan periode</button></div>${audit(state.settings)}</form><div class="section-heading"><div><h2>Kelompok & pengurus</h2><p>Urutan kecil tampil lebih dahulu. Ketua ditampilkan paling atas.</p></div><button type="button" class="button primary" data-action="add-group">${icon("plus")}Tambah kelompok</button></div><div class="org-grid">${state.groups.map(g => {
        const members = state.members.filter(m => m.group_id === g.id).sort((a,b) => a.position - b.position || a.name.localeCompare(b.name));
        return `<article class="card org-card"><div class="card-header"><div><span class="org-type">${kinds[g.kind]} · Urutan ${g.position}</span><h3>${esc(g.name)}</h3></div><div class="row-actions"><button type="button" class="icon-button" data-action="edit-group" data-id="${g.id}" aria-label="Ubah kelompok ${esc(g.name)}">${icon("edit")}</button><button type="button" class="icon-button delete" data-action="delete-group" data-id="${g.id}" aria-label="Hapus kelompok ${esc(g.name)}">${icon("trash")}</button></div></div><div class="org-members">${members.length ? members.map(m => `<div class="org-member"><span class="avatar">${esc(m.name.trim().charAt(0))}</span><span class="org-member-info"><strong>${esc(m.name)}${m.is_chair ? ' <span class="badge">Ketua DKM</span>' : ""}</strong><small>${esc(m.role || "Anggota")} · Urutan ${m.position}</small></span><button type="button" class="icon-button" data-action="edit-member" data-id="${m.id}" aria-label="Ubah ${esc(m.name)}">${icon("edit")}</button><button type="button" class="icon-button delete" data-action="delete-member" data-id="${m.id}" aria-label="Hapus ${esc(m.name)}">${icon("trash")}</button></div>`).join("") : '<p class="muted" style="font-size:11px;padding:20px 0">Belum ada anggota dalam kelompok ini.</p>'}</div><div class="org-card-footer"><span>${members.length} pengurus</span><button type="button" class="button secondary" data-action="add-member" data-group="${g.id}">${icon("plus")}Tambah pengurus</button></div></article>`;
      }).join("")}</div>${state.groups.length ? "" : `<div class="card">${empty("Susunan pengurus belum diisi", "Buat kelompok Penasehat, Pengurus Inti, Seksi, atau Unit. Data lama juga bisa dimasukkan melalui seed.sql.", "add-group", "Buat kelompok", "users")}</div>`}`;
  }
  function renderProfile() {
    const p = settings("profile");
    $("#view-profil").innerHTML = heading("INFORMASI MASJID", "Profil & kontak", "Pastikan jamaah mendapatkan informasi dan kontak yang tepat.") + `<div class="settings-layout"><form class="card settings-card" data-settings="profile"><h2 class="form-section-title">Identitas & cerita masjid</h2><p class="form-section-note">Tampil di beranda dan bagian Tentang Kami.</p>${field("name","Nama masjid",p.name,{required:true,max:100})}${field("tagline","Kalimat pembuka beranda",p.tagline,{textarea:true,max:500})}${field("description","Tentang masjid",p.description,{textarea:true,max:3000})}${field("about","Kegiatan & pengelolaan masjid",p.about,{textarea:true,max:3000})}${imagePicker("hero_image_url",p.hero_image_url,"Foto utama beranda")}<div class="form-separator"></div><h2 class="form-section-title">Alamat & kanal resmi</h2><p class="form-section-note">Tautan dan nomor ini akan digunakan pada tombol kontak website.</p>${field("address","Alamat lengkap",p.address,{textarea:true,required:true,max:500})}${field("whatsapp","Nomor WhatsApp",p.whatsapp,{type:"tel",required:true,max:30,hint:"Gunakan format 08… atau +62…."})}${field("maps_url","Tautan Google Maps",p.maps_url,{type:"url",required:true})}${field("instagram_url","Tautan Instagram",p.instagram_url,{type:"url"})}${field("youtube_url","Tautan YouTube",p.youtube_url,{type:"url"})}<div class="settings-footer"><p>Perubahan tampil setelah website dimuat ulang.</p><button type="submit" class="button primary">Simpan profil</button></div>${audit(state.settings)}</form><aside class="settings-aside"><div class="card"><h3>Profil yang mudah ditemukan</h3><p>Gunakan nama resmi masjid dan nomor WhatsApp pengurus yang aktif.</p><ol><li>Periksa kembali alamat dan tautan Maps.</li><li>Gunakan foto masjid berbentuk landscape.</li><li>Kosongkan tautan media sosial yang tidak digunakan.</li></ol></div><div class="tip-card"><span class="eyebrow">FOTO BERANDA</span><h3>Sudut terbaik masjid.</h3><p>Foto yang terang dengan ukuran minimal 1600 × 900 piksel akan terlihat lebih baik di layar besar. Kosongkan URL untuk menggunakan foto bawaan.</p></div></aside></div>`;
  }
  function renderDonation() {
    const d = settings("donation");
    $("#view-donasi").innerHTML = heading("KEBAIKAN BERSAMA", "Donasi & infak", "Kelola informasi penyaluran infak yang tampil untuk jamaah.") + `<div class="settings-layout"><form class="card settings-card" data-settings="donation"><h2 class="form-section-title">Informasi infak</h2><p class="form-section-note">Aktifkan setelah rekening atau QRIS resmi masjid sudah lengkap.</p>${checkbox("enabled","Tampilkan bagian donasi di website",d.enabled)}${field("title","Judul ajakan",d.title,{required:true,max:150})}${field("description","Tujuan & keterangan infak",d.description,{textarea:true,max:1500})}<div class="form-separator"></div><h2 class="form-section-title">Rekening masjid</h2><p class="form-section-note">Isi sesuai rekening resmi yang digunakan pengurus.</p>${field("bank_name","Nama bank",d.bank_name,{max:100})}${field("account_number","Nomor rekening",d.account_number,{max:60})}${field("account_holder","Atas nama",d.account_holder,{max:150})}${imagePicker("qris_url",d.qris_url,"Gambar QRIS resmi")}<div class="settings-footer"><p>Periksa kembali nomor dan nama penerima.</p><button type="submit" class="button primary">Simpan informasi infak</button></div>${audit(state.settings)}</form><aside class="settings-aside"><div class="card"><h3>Informasi yang tampil</h3><p>Bagian donasi menampilkan judul, tujuan, rekening, dan gambar QRIS yang lu masukkan. Rekening dan QRIS boleh digunakan salah satu atau keduanya.</p></div><div class="tip-card"><span class="eyebrow">UNTUK JAMAAH</span><h3>Jelas tujuannya,<br />mudah menyalurkannya.</h3><p>Tuliskan tujuan infak secara singkat, misalnya untuk operasional, kegiatan sosial, atau renovasi masjid.</p></div></aside></div>`;
  }
  function renderView(view) {
    if (view === "dashboard") renderDashboard();
    else if (view === "kegiatan") renderList("activity");
    else if (view === "pengumuman") renderList("announcement");
    else if (view === "organisasi") renderOrganization();
    else if (view === "profil") renderProfile();
    else if (view === "donasi") renderDonation();
    // Jangan tampilkan tombol simpan sebelum pembacaan data berhasil.
    $$("form[data-settings]", $("#view-" + view)).forEach(form => {
      if (!state.ready.settings) $$("button, input, textarea, select",form).forEach(el => { el.disabled = true; });
    });
    const allowed = { kegiatan:"activities", pengumuman:"announcements", organisasi:"organization", profil:"settings", donasi:"settings" };
    if (allowed[view] && !state.ready[allowed[view]]) {
      $$("button[data-action], button[type=submit], input, textarea, select", $("#view-" + view)).forEach(el => { el.disabled = true; });
    }
  }
  async function loadAll() {
    const currentAuth = authVersion;
    state.loading = true; state.errors = [];
    $("#connection").innerHTML = '<span class="live-dot"></span>Memuat data';
    const requests = [
      ["activities", "kegiatan", client.from("kegiatan").select("*").order("created_at", { ascending:false })],
      ["announcements", "pengumuman", client.from("pengumuman").select("*").order("created_at", { ascending:false })],
      ["groups", "organization_groups", client.from("organization_groups").select("*").order("position").order("name")],
      ["members", "organization_members", client.from("organization_members").select("*").order("position")],
      ["settings", "site_settings", client.from("site_settings").select("*").eq("id",1).single()]
    ];
    const results = await Promise.allSettled(requests.map(r => r[2]));
    if (authVersion !== currentAuth || !state.user) return;
    results.forEach((result, i) => {
      const [key, table] = requests[i];
      if (result.status === "rejected" || result.value.error) {
        state.ready[key] = false; state.errors.push(table + ": " + message(result.reason || result.value.error));
      } else { state.ready[key] = true; state[key] = result.value.data; }
    });
    state.ready.organization = state.ready.groups && state.ready.members;
    state.loading = false;
    $("#navActivityCount").textContent = state.activities.length;
    $("#setupNotice").hidden = !state.errors.length;
    $("#setupNotice").innerHTML = state.errors.length ? `<strong>Sebagian data belum bisa dimuat.</strong><br />${state.errors.map(esc).join("<br />")}<br /><button type="button" class="button secondary" data-action="reload">Coba lagi</button>` : "";
    $("#connection").classList.toggle("failed", !!state.errors.length);
    $("#connection").innerHTML = '<span class="live-dot"></span>' + (state.errors.length ? "Periksa koneksi / setup" : "Terhubung");
    renderView(state.view);
  }
  async function openEditor(type, id, groupId) {
    if (state.busy) return;
    const collection = { activity:"activities", announcement:"announcements", group:"groups", member:"members" }[type];
    if (!state.ready[collection]) { toast("Data belum siap. Periksa koneksi dan setup database.", true); return; }
    const record = id ? state[collection].find(r => r.id === id) : null;
    if (id && !record) return;
    const r = record || {};
    editor = { type, id, collection }; editorDirty = false;
    $("#editorTitle").textContent = (id ? "Ubah " : "Tambah ") + ({activity:"kegiatan",announcement:"pengumuman",group:"kelompok",member:"pengurus"}[type]);
    $("#editorEyebrow").textContent = ["member","group"].includes(type) ? "ORGANISASI MASJID" : "KONTEN MASJID";
    $("#previewBtn").hidden = !["activity","announcement"].includes(type);
    $("#saveBtn").textContent = id ? "Simpan perubahan" : "Simpan " + ({activity:"kegiatan",announcement:"pengumuman",group:"kelompok",member:"pengurus"}[type]);
    $("#editorError").hidden = true;
    let html = "";
    if (type === "activity") html = field("title","Judul kegiatan",r.title,{required:true,max:200}) + `<div class="form-row">${field("category","Kategori",r.category || "Kajian",{choices:categories})}${field("event_date","Tanggal kegiatan",r.event_date,{type:"date",hint:"Boleh kosong untuk program rutin."})}</div>` + field("description","Deskripsi",r.description,{textarea:true,max:3000}) + activityImagePicker(r) + field("status","Status konten",r.status || "draft",{choices:[["draft","Draft — simpan dulu"],["published","Terbit — tampil di website"],["archived","Arsip — sembunyikan dari website"]]});
    if (type === "announcement") html = field("title","Judul pengumuman",r.title,{required:true,max:200}) + field("body","Isi pengumuman",r.body,{textarea:true,required:true,max:5000}) + `<div class="form-row">${field("start_date","Mulai tayang",r.start_date,{type:"date",hint:"Kosong berarti langsung tayang saat diterbitkan."})}${field("end_date","Akhir tayang",r.end_date,{type:"date",hint:"Kosong berarti tanpa batas akhir."})}</div>` + checkbox("pinned","Sematkan di urutan paling atas",r.pinned) + field("status","Status konten",r.status || "draft",{choices:[["draft","Draft — simpan dulu"],["published","Terbit — sesuai masa tayang"],["archived","Arsip — sembunyikan dari website"]]});
    if (type === "group") html = field("name","Nama kelompok",r.name,{required:true,max:150,placeholder:"Contoh: Seksi Pendidikan"}) + `<div class="form-row">${field("kind","Jenis kelompok",r.kind || "section",{choices:Object.entries(kinds)})}${field("position","Urutan tampil",r.position ?? state.groups.length + 1,{type:"number",required:true,min:0,step:1})}</div><div class="notice info">Ketua DKM hanya dapat ditetapkan pada anggota kelompok Pengurus inti.</div>`;
    if (type === "member") html = field("name","Nama pengurus",r.name,{required:true,max:150}) + field("role","Jabatan / peran",r.role,{max:150,placeholder:"Contoh: Ketua, Bendahara, atau Anggota"}) + `<div class="form-row">${field("group_id","Kelompok",r.group_id || groupId,{choices:state.groups.map(g => [g.id,g.name]),required:true})}${field("position","Urutan dalam kelompok",r.position ?? state.members.filter(m => m.group_id === groupId).length + 1,{type:"number",required:true,min:0,step:1})}</div>` + checkbox("is_chair","Tetapkan sebagai Ketua DKM",r.is_chair,"Tampil paling atas di bagan. Hanya satu Ketua DKM yang aktif.");
    $("#editorBody").innerHTML = html + audit(record);
    $("#editorDialog").showModal();
  }
  async function closeEditor() {
    if (state.busy || state.uploads) { toast("Tunggu proses simpan atau upload selesai."); return; }
    if (editorDirty && !await confirmAction("Tutup tanpa menyimpan?", "Perubahan pada form ini belum disimpan.", "Tutup form")) return;
    $("#editorDialog").close(); editor = null; editorDirty = false;
  }
  function formPayload(form) { return Object.fromEntries(new FormData(form).entries()); }
  function cleanStrings(payload) { Object.keys(payload).forEach(k => { if (typeof payload[k] === "string") payload[k] = payload[k].trim(); }); return payload; }
  function validateDates(start,end) { if (start && end && end < start) throw new Error("Tanggal akhir harus sama dengan atau setelah tanggal mulai."); }
  async function saveEditor(event) {
    event.preventDefault();
    if (!editor || state.busy || state.uploads) return;
    state.busy = true;
    const btn = $("#saveBtn"), oldLabel = btn.textContent; btn.disabled = true; btn.textContent = "Menyimpan…";
    $("#editorError").hidden = true;
    try {
      const p = cleanStrings(formPayload(event.target)), type = editor.type;
      if (type === "activity") {
        if (!p.title) throw new Error("Judul kegiatan wajib diisi.");
        p.event_date ||= null; p.description ||= null;
        let images;
        try { images = JSON.parse(p.image_urls || "[]"); } catch { throw new Error("Daftar foto tidak valid. Muat ulang form lalu pilih kembali fotonya."); }
        if (!Array.isArray(images)) throw new Error("Daftar foto tidak valid.");
        images = images.map(safeUrl).filter(Boolean);
        if (p.image_url) {
          const manualImage = safeUrl(p.image_url);
          if (!manualImage) throw new Error("URL gambar harus diawali https:// atau http://.");
          if (!images.includes(manualImage)) images.unshift(manualImage);
        }
        if (images.length > 8) throw new Error("Maksimal 8 foto untuk setiap kegiatan.");
        p.image_urls = images; p.image_url = images[0] || null;
      }
      if (type === "announcement") {
        if (!p.title || !p.body) throw new Error("Judul dan isi pengumuman wajib diisi.");
        validateDates(p.start_date,p.end_date); p.start_date ||= null; p.end_date ||= null; p.pinned = $("[name=pinned]", event.target).checked;
      }
      if (type === "group" || type === "member") {
        if (!p.name) throw new Error("Nama wajib diisi.");
        p.position = Number(p.position);
        if (!Number.isInteger(p.position) || p.position < 0) throw new Error("Urutan harus berupa bilangan bulat mulai dari 0.");
      }
      if (type === "group" && p.kind !== "core" && state.members.some(m => m.group_id === editor.id && m.is_chair)) throw new Error("Pindahkan atau ubah penetapan Ketua DKM sebelum mengganti jenis kelompok ini.");
      if (type === "member") {
        p.is_chair = $("[name=is_chair]", event.target).checked;
        if (p.is_chair && state.groups.find(g => g.id === p.group_id)?.kind !== "core") throw new Error("Ketua DKM harus berada dalam kelompok Pengurus inti.");
        if (p.is_chair && state.members.some(m => m.is_chair && m.id !== editor.id)) throw new Error("Masih ada Ketua DKM aktif. Lepaskan penetapan ketua pada pengurus tersebut terlebih dahulu.");
      }
      const table = {activity:"kegiatan",announcement:"pengumuman",group:"organization_groups",member:"organization_members"}[type];
      const query = editor.id ? client.from(table).update(p).eq("id",editor.id) : client.from(table).insert(p);
      throwError(await query.select("id").single());
      $("#editorDialog").close(); editorDirty = false; editor = null;
      await loadAll(); toast("Perubahan berhasil disimpan.");
    } catch (error) { $("#editorError").textContent = message(error); $("#editorError").hidden = false; $("#editorError").scrollIntoView({block:"nearest"}); }
    finally { state.busy = false; btn.disabled = false; btn.textContent = oldLabel; }
  }
  async function deleteRecord(type, id) {
    if (state.busy || state.uploads) return;
    const [collection,table] = {activity:["activities","kegiatan"],announcement:["announcements","pengumuman"],group:["groups","organization_groups"],member:["members","organization_members"]}[type];
    const row = state[collection].find(r => r.id === id); if (!row) return;
    const count = type === "group" ? state.members.filter(m => m.group_id === id).length : 0;
    if (!await confirmAction("Hapus " + ({activity:"kegiatan",announcement:"pengumuman",group:"kelompok",member:"pengurus"}[type]) + "?", `“${row.title || row.name}” akan dihapus.${count ? ` ${count} pengurus dalam kelompok ini juga akan dihapus.` : ""}`)) return;
    state.busy = true;
    try { throwError(await client.from(table).delete().eq("id",id).select("id").single()); await loadAll(); toast("Data berhasil dihapus."); }
    catch(error) { toast(message(error),true); }
    finally { state.busy = false; }
  }
  async function saveSettings(form) {
    const section = form.dataset.settings;
    if (!state.ready.settings || state.busy || state.uploads) return;
    state.busy = true;
    const btn = $("button[type=submit]",form), text = btn.textContent; btn.disabled = true; btn.textContent = "Menyimpan…";
    try {
      const p = cleanStrings(formPayload(form));
      if (section === "organization") validateDates(p.start_date,p.end_date);
      if (section === "profile") {
        if (!p.name || !p.address) throw new Error("Nama dan alamat masjid wajib diisi.");
        const phone = p.whatsapp.replace(/[^0-9]/g,"").replace(/^0/,"62");
        if (!/^62\d{8,13}$/.test(phone)) throw new Error("Nomor WhatsApp harus memakai format Indonesia 08… atau +62…. ");
        for (const key of ["maps_url","instagram_url","youtube_url","hero_image_url"]) if (p[key] && !safeUrl(p[key])) throw new Error("Tautan harus diawali https:// atau http://.");
      }
      if (section === "donation") {
        p.enabled = $("[name=enabled]",form).checked;
        const hasBank = p.bank_name || p.account_number || p.account_holder;
        if (hasBank && !(p.bank_name && p.account_number && p.account_holder)) throw new Error("Lengkapi nama bank, nomor rekening, dan nama penerima.");
        if (p.enabled && !(hasBank || p.qris_url)) throw new Error("Isi rekening atau QRIS sebelum menampilkan bagian donasi.");
        if (p.qris_url && !safeUrl(p.qris_url)) throw new Error("URL QRIS harus diawali https:// atau http://.");
      }
      throwError(await client.from("site_settings").update({[section]:p}).eq("id",1).select("id").single());
      settingsDirty.delete(section); await loadAll(); toast("Pengaturan berhasil disimpan.");
    } catch(error) { toast(message(error),true); }
    finally { state.busy = false; btn.disabled = false; btn.textContent = text; }
  }
  async function preparePhoto(file, name) {
    // QRIS tetap utuh agar kode dan detail penerima tidak rusak oleh kompresi.
    if (name === "qris_url") return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .8));
      if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
    } catch { return file; }
    finally { if (bitmap) bitmap.close(); }
  }
  async function upload(input) {
    const files = Array.from(input.files || []); if (!files.length || !state.user) return;
    const container = input.closest("form"), name = input.dataset.upload, status = $(`[data-upload-state="${name}"]`,container);
    const extensions = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    if (files.some(file => !extensions[file.type] || file.size > 5 * 1024 * 1024)) { status.textContent = "Setiap foto harus JPG, PNG, atau WebP dengan ukuran maksimal 5 MB."; input.value = ""; return; }
    if (name === "activity_images") {
      let current = []; try { current = JSON.parse($('[name="image_urls"]',container).value || "[]"); } catch {}
      if (current.length + files.length > 8) { status.textContent = "Maksimal 8 foto untuk setiap kegiatan."; input.value = ""; return; }
    }
    state.uploads++; input.disabled = true; status.textContent = files.length > 1 ? `Mengupload ${files.length} foto…` : "Mengupload gambar…";
    $$("button[type=submit]",container).forEach(b => { b.disabled = true; });
    try {
      const uploaded = [];
      for (const original of files) {
        const file = await preparePhoto(original, name);
        const path = `${state.user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
        throwError(await client.storage.from("masjid-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type}));
        const url = client.storage.from("masjid-media").getPublicUrl(path).data.publicUrl;
        uploaded.push(url);
        if (name === "activity_images") {
          const hidden = $('[name="image_urls"]',container), urls = [...JSON.parse(hidden.value || "[]"), url];
          hidden.value = JSON.stringify(urls);
          $(`[data-activity-image-list]`,container).innerHTML = urls.map((image,index) => `<div class="activity-image-item"><img src="${esc(image)}" alt="Pratinjau foto ${index + 1}" /><button type="button" class="button secondary" data-remove-activity-image="${index}" aria-label="Hapus foto ${index + 1}">Hapus</button></div>`).join("");
          const primary = $('[name="image_url"]',container); if (!primary.value) primary.value = urls[0] || "";
          editorDirty = true;
        }
      }
      if (name === "activity_images") {
        // Daftar dan pratinjau diperbarui per file agar upload parsial tidak hilang dari form.
      } else {
        $(`[name="${name}"]`,container).value = uploaded[0];
        const preview = $(`[data-image-preview="${name}"]`,container); preview.src = uploaded[0]; preview.hidden = false;
      }
      status.textContent = name === "activity_images" ? `${uploaded.length} foto terupload. Simpan form untuk menerapkan perubahan.` : "Gambar terupload. Simpan form untuk menerapkan perubahan.";
      if (container.dataset.settings) settingsDirty.add(container.dataset.settings); else editorDirty = true;
    } catch(error) { status.textContent = "Upload gagal: " + message(error); }
    finally { state.uploads--; input.disabled = false; input.value = ""; $$("button[type=submit]",container).forEach(b => { b.disabled = false; }); }
  }
  function preview() {
    if (!editor) return;
    const p = formPayload($("#editorForm"));
    const image = editor.type === "activity" ? safeUrl(p.image_url) : "";
    $("#previewBody").innerHTML = `<article class="preview-card">${image ? `<img src="${esc(image)}" alt="Foto kegiatan" />` : ""}<div class="preview-content"><span class="badge">${esc(editor.type === "activity" ? p.category : "Pengumuman")}</span><h3>${esc(p.title || "Judul konten")}</h3><p>${esc(p.description || p.body || "Deskripsi akan tampil di sini.")}</p><time>${esc(editor.type === "activity" ? fmtDate(p.event_date) : (p.start_date ? fmtDate(p.start_date) : "Langsung tayang saat terbit") + (p.end_date ? " – " + fmtDate(p.end_date) : ""))}</time></div></article><p class="hint" style="margin-top:14px">Pratinjau isi konten. Konten draft dan arsip tidak ditampilkan di website publik.</p>`;
    $("#previewDialog").showModal();
  }
  function clearSession() {
    authVersion++; state.user = null; state.ready = {}; state.activities=[]; state.announcements=[]; state.groups=[]; state.members=[]; state.settings=null;
    settingsDirty.clear(); editorDirty = false; editor = null;
    $$("dialog[open]").forEach(d => d.close());
    $("#appShell").hidden = true; $("#loginScreen").hidden = false; setSidebar(false);
  }
  async function applySession(session) {
    if (!session?.user) { clearSession(); return; }
    if (state.user?.id === session.user.id) return;
    authVersion++; state.user = session.user;
    $("#loginScreen").hidden = true; $("#appShell").hidden = false;
    $("#userEmail").textContent = state.user.email;
    $("#userInitial").textContent = state.user.email.charAt(0).toUpperCase();
    renderView(state.view); await loadAll();
  }
  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault(); if (!client) return;
    const btn = $("#loginBtn"); btn.disabled = true; btn.textContent = "Memeriksa akun…"; $("#loginError").hidden = true;
    try {
      const p = formPayload(event.target);
      const result = await client.auth.signInWithPassword({email:p.email.trim(),password:p.password});
      if (result.error) throw new Error(result.error.status === 400 ? "Email atau password belum sesuai. Periksa kembali dan coba lagi." : message(result.error));
      $("[name=password]",event.target).value = ""; await applySession(result.data.session);
    } catch(error) { $("#loginError").textContent = message(error); $("#loginError").hidden = false; }
    finally { btn.disabled = false; btn.innerHTML = "Masuk ke ruang pengurus " + icon("arrow"); }
  });
  $("#togglePassword").addEventListener("click", () => {
    const input = $("#loginForm [name=password]"), showing = input.type === "password";
    input.type = showing ? "text" : "password"; $("#togglePassword").setAttribute("aria-label",showing ? "Sembunyikan password" : "Tampilkan password"); $("#togglePassword").setAttribute("aria-pressed",String(showing));
  });
  $("#logoutBtn").addEventListener("click", async () => {
    if (state.busy || state.uploads) { toast("Tunggu proses yang sedang berjalan selesai."); return; }
    if ((editorDirty || settingsDirty.size) && !await confirmAction("Keluar dari admin?", "Perubahan yang belum disimpan akan ditinggalkan.", "Keluar")) return;
    try { throwError(await client.auth.signOut()); clearSession(); toast("Berhasil keluar dari ruang pengurus."); } catch(error) { toast(message(error),true); }
  });
  $("#menuBtn").addEventListener("click", () => setSidebar(!$("#sidebar").classList.contains("open")));
  $("#sidebarShade").addEventListener("click", () => setSidebar(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setSidebar(false); });
  document.addEventListener("click", async e => {
    const removePhoto = e.target.closest("[data-remove-activity-image]");
    if (removePhoto) {
      const form = removePhoto.closest("form"), hidden = $('[name="image_urls"]',form), index = Number(removePhoto.dataset.removeActivityImage);
      let urls = []; try { urls = JSON.parse(hidden.value || "[]"); } catch {}
      urls.splice(index,1); hidden.value = JSON.stringify(urls);
      $(`[data-activity-image-list]`,form).innerHTML = urls.map((url,i) => `<div class="activity-image-item"><img src="${esc(url)}" alt="Pratinjau foto ${i + 1}" /><button type="button" class="button secondary" data-remove-activity-image="${i}" aria-label="Hapus foto ${i + 1}">Hapus</button></div>`).join("");
      const primary = $('[name="image_url"]',form); if (primary.value && !urls.includes(safeUrl(primary.value))) primary.value = "";
      editorDirty = true;
      return;
    }
    const button = e.target.closest("button"); if (!button || button.disabled) return;
    if (button.dataset.view) { if (state.busy || state.uploads) { toast("Tunggu proses selesai."); return; } navigate(button.dataset.view); }
    if (button.hasAttribute("data-close-editor")) closeEditor();
    const action = button.dataset.action; if (!action) return;
    if (action === "reload") { if (!state.busy && !state.uploads) { if (settingsDirty.size && !await confirmAction("Muat ulang data?", "Perubahan pengaturan yang belum disimpan akan ditinggalkan.", "Muat ulang")) return; settingsDirty.clear(); loadAll(); } return; }
    if (action.startsWith("view-")) { if (!state.busy && !state.uploads) navigate(action.slice(5)); return; }
    const [verb,type] = action.split("-");
    if (verb === "add" || verb === "edit") openEditor(type,button.dataset.id,button.dataset.group);
    else if (verb === "delete") deleteRecord(type,button.dataset.id);
  });
  document.addEventListener("input", e => {
    const form = e.target.closest("form");
    if (form?.id === "editorForm") editorDirty = true;
    if (form?.dataset.settings) settingsDirty.add(form.dataset.settings);
    if (e.target.dataset.listSearch) renderListRows(e.target.dataset.listSearch);
    const previewImage = form && $(`[data-image-preview="${e.target.name}"]`,form);
    if (previewImage) { const url = safeUrl(e.target.value); previewImage.hidden = !url; if (url) previewImage.src = url; else previewImage.removeAttribute("src"); }
  });
  document.addEventListener("change", e => {
    if (e.target.dataset.upload) upload(e.target);
    if (e.target.dataset.statusFilter) renderListRows(e.target.dataset.statusFilter);
    if (e.target.hasAttribute("data-category-filter")) renderListRows("activity");
    const form = e.target.closest("form");
    if (form?.dataset.settings) settingsDirty.add(form.dataset.settings);
    if (form?.id === "editorForm") editorDirty = true;
  });
  document.addEventListener("submit", e => { if (e.target.dataset.settings) { e.preventDefault(); saveSettings(e.target); } });
  document.addEventListener("error", e => { if (e.target.tagName === "IMG") { e.target.hidden = true; } },true);
  $("#editorForm").addEventListener("submit",saveEditor);
  $("#editorDialog").addEventListener("cancel",e => { e.preventDefault(); closeEditor(); });
  $("#previewBtn").addEventListener("click",preview);
  $("#closePreview").addEventListener("click", () => $("#previewDialog").close());
  window.addEventListener("beforeunload",e => { if (editorDirty || settingsDirty.size || state.uploads || state.busy) { e.preventDefault(); e.returnValue = ""; } });
  $("#todayLabel").textContent = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  loadBrandLogo();
  async function init() {
    const cfg = window.SUPABASE_CONFIG || {};
    try {
      if (!cfg.url || !cfg.anonKey || cfg.anonKey.startsWith("ISI_") || cfg.anonKey.startsWith("isi_")) throw new Error("Supabase belum dikonfigurasi. Isi config.js untuk lokal, atau SUPABASE_URL dan SUPABASE_ANON_KEY di Vercel.");
      if (!window.supabase) throw new Error("Koneksi belum tersedia. Library Supabase gagal dimuat; periksa internet lalu muat ulang halaman.");
      client = window.supabase.createClient(cfg.url,cfg.anonKey);
      client.auth.onAuthStateChange((event,session) => {
        // Jalankan pembacaan database setelah callback Auth selesai.
        if (event === "SIGNED_OUT") clearSession();
        else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") setTimeout(() => applySession(session),0);
      });
      const {data,error} = await client.auth.getSession(); if (error) throw error;
      await applySession(data.session);
    } catch(error) { $("#loginError").textContent = message(error); $("#loginError").hidden = false; if (!client) $("#loginBtn").disabled = true; }
  }
  init();
})();
