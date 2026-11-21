/* Konten publik menggunakan client anonim terpisah dari sesi admin. */
(function () {
  "use strict";
  const client = window.MASJID_PUBLIC_CLIENT;
  if (!client) return;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeUrl = value => { try { const url = new URL(value); return ["https:","http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
  const dateLabel = value => { const date = new Date(value + "T00:00:00+07:00"); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("id-ID", {timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric"}).format(date); };
  function text(selector, value) { $$(selector).forEach(el => { el.textContent = value; }); }
  function updateChannel(selector, url) {
    $$(selector).forEach(el => {
      if (url) el.href = url;
      const wrapper = el.classList.contains("kontak-card") ? el.parentElement : el;
      wrapper.hidden = !url;
    });
  }
  function addNav(label, anchor) {
    if ($(`#footNav [data-content-anchor="${anchor}"]`)) return;
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.contentAnchor = anchor;
    button.addEventListener("click",() => window.goHome(anchor)); $("#footNav").append(button);
  }
  function renderProfile(raw) {
    const p = {...window.MASJID_DEFAULTS.profile,...raw};
    text(".brand .bname, .foot-brand .nm, .loc-head .nm",p.name);
    $(".hero h1").textContent = p.name;
    // Panjang judul boleh berubah, pemisahan baris tetap mengikuti lebar layar.
    $(".hero h1").style.maxWidth = "12ch";
    text(".hero .tagline",p.tagline);
    const paragraphs = $$(".tentang-grid p.body");
    [p.description,p.about].forEach((value,i) => { paragraphs[i].textContent = value; paragraphs[i].classList.add("settings-text"); });
    text(".loc-head .ad",p.address);
    const footerAddress = $(".foot-brand > p:not(.row)"); if (footerAddress) footerAddress.textContent = p.address;
    window.ALAMAT = p.address;
    document.title = p.name + " — Jatimurni, Bekasi";
    $("meta[name=description]").content = (p.description || p.tagline).slice(0,300);
    const hero = safeUrl(p.hero_image_url);
    if (hero) { const image = $(".hero > img.bg"), original = image.src; image.addEventListener("error",() => { image.src = original; },{once:true}); image.src = hero; }
    let phone = String(p.whatsapp || "").replace(/[^0-9]/g,"").replace(/^0/,"62");
    updateChannel('a[href^="https://wa.me/"]',phone ? "https://wa.me/" + phone : "");
    const whatsappCard = $('.kontak-card[href^="https://wa.me/"] .dt'); if (whatsappCard) whatsappCard.textContent = p.whatsapp;
    const instagram = safeUrl(p.instagram_url), youtube = safeUrl(p.youtube_url), maps = safeUrl(p.maps_url);
    updateChannel('a[href*="instagram.com"]',instagram);
    updateChannel('a[href*="youtube.com"], a[href*="youtu.be"]',youtube);
    const igText = $('.kontak-card[href*="instagram.com"] .dt');
    if (igText && instagram) igText.textContent = new URL(instagram).pathname.replace(/^\//,"@").replace(/\/$/,"") || "Kanal resmi masjid";
    const ytText = $('.kontak-card[href*="youtube.com"] .dt'); if (ytText && youtube) ytText.textContent = "Kanal resmi " + p.name;
    if (maps) { $(".map-link").href = maps; $(".loc-actions .btn-green").href = maps; }
  }
  function renderOrganizationSettings(raw) {
    const o = {...window.MASJID_DEFAULTS.organization,...raw};
    const start = dateLabel(o.start_date), end = dateLabel(o.end_date);
    $("#organizationPeriod").textContent = start && end ? `Periode ${start} s/d ${end}` : "";
    $("#organizationPeriod").hidden = !(start && end);
    $("#organizationDecree").textContent = o.decree ? "Lampiran Surat No: " + o.decree : "";
    $("#organizationDecree").hidden = !o.decree;
  }
  function renderDonation(raw) {
    const d = {...window.MASJID_DEFAULTS.donation,...raw};
    const bank = d.bank_name && d.account_number && d.account_holder, qris = safeUrl(d.qris_url);
    if (!d.enabled || !(bank || qris)) { $("#donasi").hidden = true; return; }
    text("#donationHeading",d.title); text("#donationDescription",d.description);
    $("#donationBankCard").hidden = !bank; $("#donationQrisCard").hidden = !qris;
    if (bank) {
      text("#donationBank",d.bank_name); text("#donationAccount",d.account_number); text("#donationHolder","Atas nama " + d.account_holder);
      $("#copyDonationBtn").addEventListener("click",async () => {
        const button = $("#copyDonationBtn");
        try { await navigator.clipboard.writeText(d.account_number); button.textContent = "Nomor rekening tersalin"; }
        catch { button.textContent = "Pilih dan salin nomor rekening di atas"; }
        setTimeout(() => { button.textContent = "Salin nomor rekening"; },3000);
      });
    }
    if (qris) $("#donationQris").src = qris;
    $("#donasi").hidden = false; addNav("Donasi & Infak","donasi");
  }
  function renderAnnouncements(rows) {
    const parts = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const live = rows.filter(r => r.status === "published" && (!r.start_date || r.start_date <= today) && (!r.end_date || r.end_date >= today));
    $("#announcementList").innerHTML = live.map(r => `<article class="announcement-card${r.pinned ? " pinned" : ""}"><span class="badge mint">${r.pinned ? "Pengumuman utama" : "Info jamaah"}</span><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p>${r.end_date ? `<time datetime="${esc(r.end_date)}">Berlaku sampai ${esc(dateLabel(r.end_date))}</time>` : ""}</article>`).join("");
    $("#pengumuman").hidden = !live.length;
    if (live.length) addNav("Pengumuman","pengumuman");
  }
  function renderOrganization(groups,members) {
    const sortedGroups = groups.slice().sort((a,b) => a.position - b.position || a.name.localeCompare(b.name));
    const sortedMembers = members.slice().sort((a,b) => a.position - b.position || a.name.localeCompare(b.name));
    const inGroup = g => sortedMembers.filter(m => m.group_id === g.id);
    const memberCard = (m,chair = false,g) => `<div class="pengurus-card${chair ? " utama" : ""}"><p class="jb">${esc(m.role || (chair ? "Ketua DKM" : g.name))}</p><p class="nm">${esc(m.name)}</p></div>`;
    const empty = '<p class="organization-empty">Susunan pengurus belum diisi.</p>';
    const advisors = sortedGroups.filter(g => g.kind === "advisor");
    $("#penasehatGrid").innerHTML = advisors.map(g => inGroup(g).map(m => memberCard(m,false,g)).join("")).join("") || empty;
    const core = sortedGroups.filter(g => g.kind === "core").flatMap(g => inGroup(g).map(m => ({...m,group:g})));
    const chair = core.find(m => m.is_chair);
    $("#ketuaWrap").innerHTML = chair ? memberCard(chair,true,chair.group) : "";
    $("#ketuaWrap").hidden = !chair;
    $(".org-lines").hidden = !chair || core.length < 2;
    $("#intiGrid").innerHTML = core.filter(m => !m.is_chair).map(m => memberCard(m,false,m.group)).join("") || (chair ? "" : empty);
    const accordion = g => { const list = inGroup(g); return `<div class="accordion"><button type="button" aria-expanded="false"><span><span class="an">${esc(g.name)}</span><span class="ac">${list.length} pengurus</span></span><span class="chev-c" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></span></button><div class="panel"><div class="panel-in"><ol>${list.length ? list.map((m,i) => `<li>${i + 1}. ${esc(m.name)}${m.role && m.role !== "Anggota" ? ` <span style="color:var(--dim)">· ${esc(m.role)}</span>` : ""}</li>`).join("") : "<li>Belum ada pengurus.</li>"}</ol></div></div></div>`; };
    $("#seksiGrid").innerHTML = sortedGroups.filter(g => g.kind === "section").map(accordion).join("") || empty;
    $("#unitGrid").innerHTML = sortedGroups.filter(g => g.kind === "unit").map(accordion).join("") || empty;
  }
  // Kegagalan suatu fitur tidak menghalangi fitur lain atau konten bawaan.
  client.from("site_settings").select("profile,organization,donation").eq("id",1).maybeSingle().then(res => {
    if (res.error || !res.data) return;
    renderProfile(res.data.profile); renderOrganizationSettings(res.data.organization); renderDonation(res.data.donation);
  }).catch(() => {});
  client.from("pengumuman").select("title,body,start_date,end_date,pinned,status,created_at").eq("status","published").order("pinned",{ascending:false}).order("created_at",{ascending:false}).then(res => { if (!res.error) renderAnnouncements(res.data || []); }).catch(() => {});
  Promise.all([
    client.from("organization_groups").select("id,name,kind,position").order("position"),
    client.from("organization_members").select("id,group_id,name,role,position,is_chair").order("position")
  ]).then(([groups,members]) => { if (!groups.error && !members.error) renderOrganization(groups.data || [],members.data || []); }).catch(() => {});
})();
