// Build für die Homepages des (fiktiven) Bundesamts für besondere Angelegenheiten in drei Ländervarianten.
// Liest data/<variante>/*.json, prüft alle Querverweise und erzeugt statisches HTML, JSON-LD,
// die maschinenlesbare API, llms.txt, sitemap.xml und Platzhalter-Downloads.
//
//   data/de → /        (Deutschland, BAbA)
//   data/ch → /ch/     (Schweiz, BBA – Schweizer Rechtschreibung: ss statt ß)
//   data/at → /at/     (Österreich, BBSA)
//
// Aufruf:  node tools/build.mjs            (SITE_URL=https://… node tools/build.mjs für absolute URLs)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = (process.env.SITE_URL || "https://baba.example").replace(/\/$/, "");
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const VARIANT_IDS = ["de", "ch", "at"];
const written = [];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const abs = (rel) => `${SITE_URL}/${rel}`;
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const loadVariant = (id) => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", id, f), "utf8"));
  return { id, behoerde: read("behoerde.json"), org: read("organisation.json"), personen: read("personen.json").personen, aufgaben: read("aufgaben.json").aufgaben, news: read("news.json").news, standorte: read("standorte.json").standorte, downloads: read("downloads.json").downloads };
};
const VARIANTS = VARIANT_IDS.map(loadVariant);
const VARIANT_META = VARIANTS.map((v) => ({ id: v.id, land: v.behoerde.land, name: v.behoerde.name, kurzname: v.behoerde.kurzname, pfad: v.behoerde.pfad, locale: v.behoerde.locale }));

const ACCESSIBILITY_LAW = {
  de: "der Barrierefreie-Informationstechnik-Verordnung (BITV 2.0)",
  ch: "dem Behindertengleichstellungsgesetz (BehiG) und dem Standard eCH-0059",
  at: "dem Web-Zugänglichkeits-Gesetz (WZG)",
};
const SEARCH_EXAMPLE = { de: "z. B. Register, Fristen, Kobold", ch: "z. B. Kuh, Echo, Pünktlichkeit", at: "z. B. Föhn, Stempel, Fenstertag" };
const COMMON_PAGES = ["index.html", "ueber-uns.html", "auftrag.html", "organisation.html", "personen.html", "aufgaben.html", "aktuelles.html", "service.html", "presse.html", "kontakt.html", "impressum.html", "datenschutz.html", "barrierefreiheit.html", "suche.html", "daten.html"];

for (const V of VARIANTS) buildVariant(V);
finish();

function buildVariant({ id: VID, behoerde, org, personen, aufgaben, news: newsUnsorted, standorte, downloads }) {
  const VP = behoerde.pfad; // "de/" | "ch/" | "at/"
  const B = behoerde.begriffe;
  const LOCALE = behoerde.locale;
  const swiss = (s) => (VID === "ch" ? s.replace(/ß/g, "ss") : s); // Schweizer Rechtschreibung
  const einheiten = org.einheiten;
  const news = [...newsUnsorted].sort((a, b) => b.datum.localeCompare(a.datum));

  // ---------- Indizes und Validierung ----------
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const E = byId(einheiten), P = byId(personen), S = byId(standorte);
  const errors = [];
  const need = (map, id, where) => { if (id != null && !map[id]) errors.push(`${where}: unbekannte ID "${id}"`); };
  const dup = (arr, name) => { const seen = new Set(); arr.forEach((x) => { if (seen.has(x.id)) errors.push(`${name}: doppelte ID ${x.id}`); seen.add(x.id); }); };
  dup(einheiten, "organisation"); dup(personen, "personen"); dup(aufgaben, "aufgaben"); dup(news, "news"); dup(standorte, "standorte"); dup(downloads, "downloads");
  for (const k of ["leitungPersonId", "pressePersonId", "datenschutzPersonId"]) need(P, behoerde[k], `behoerde.${k}`);
  need(S, behoerde.hauptsitzId, "behoerde.hauptsitzId");
  if (!E.leitung) errors.push('organisation: Einheit "leitung" fehlt');
  einheiten.forEach((u) => { need(E, u.parentId, `einheit ${u.id}.parentId`); need(P, u.leitungPersonId, `einheit ${u.id}.leitungPersonId`); need(P, u.vertretungPersonId, `einheit ${u.id}.vertretungPersonId`); need(S, u.standortId, `einheit ${u.id}.standortId`); });
  personen.forEach((p) => need(E, p.einheitId, `person ${p.id}.einheitId`));
  aufgaben.forEach((a) => a.einheitIds.forEach((id) => need(E, id, `aufgabe ${a.id}.einheitIds`)));
  const SZ = behoerde.auftragSeite || null; // öffentliche Auftrag-Seite
  if (SZ) for (const key of ["titel", "kurzfassung", "einleitung", "zustaendig", "nichtZustaendig"]) if (!SZ[key]) errors.push(`auftragSeite.${key} fehlt`);
  // Musterlösung (nur lokal, referenz/ ist nicht im Git und wird nicht veröffentlicht)
  const REF_FILE = path.join(ROOT, "referenz", VID, "szenario.json");
  const REF = fs.existsSync(REF_FILE) ? JSON.parse(fs.readFileSync(REF_FILE, "utf8")) : null;
  if (REF) { (REF.vorgangsarten || []).forEach((v) => need(E, v.einheitId, `referenz vorgangsarten ${v.id}.einheitId`)); (REF.beispielfaelle || []).forEach((f, i) => need(E, f.einheitId, `referenz beispielfaelle[${i}].einheitId`)); }
  news.forEach((n) => { need(E, n.einheitId, `news ${n.id}.einheitId`); n.personIds.forEach((id) => need(P, id, `news ${n.id}.personIds`)); if (!exists(n.bild)) errors.push(`news ${n.id}: Bild fehlt (${n.bild})`); });
  standorte.forEach((s) => { s.einheitIds.forEach((id) => need(E, id, `standort ${s.id}.einheitIds`)); if (!exists(s.bild)) errors.push(`standort ${s.id}: Bild fehlt`); });
  downloads.forEach((d) => need(E, d.einheitId, `download ${d.id}.einheitId`));
  for (const k of ["farbig", "negativ", "wortbildmarke", "png"]) if (!exists(behoerde.logo[k])) errors.push(`Logo fehlt: ${behoerde.logo[k]}`);
  if (VID === "ch") { const hit = JSON.stringify([behoerde, org, personen, aufgaben, news, standorte, downloads]).match(/.{0,30}ß.{0,30}/); if (hit) errors.push(`Schweizer Daten enthalten ß: …${hit[0]}…`); }
  if (errors.length) { console.error(`[${VID}] Validierung fehlgeschlagen:\n  ` + errors.join("\n  ")); process.exit(1); }

  // ---------- Hilfsfunktionen ----------
  const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
  const fullName = (p) => [p.titel, p.vorname, p.nachname].filter(Boolean).join(" ") + (p.titelNach ? `, ${p.titelNach}` : "");
  const imgBase = VID === "de" ? "assets/img" : `assets/img/${VID}`;
  const portrait = (p) => (exists(`${imgBase}/personen/${p.id}.jpg`) ? `${imgBase}/personen/${p.id}.jpg` : behoerde.logo.png);
  personen.forEach((p) => { if (!exists(`${imgBase}/personen/${p.id}.jpg`)) errors.push(`person ${p.id}: Porträt fehlt (${imgBase}/personen/${p.id}.jpg)`); });
  const children = (id) => einheiten.filter((u) => u.parentId === id);
  const unitPersons = (id) => personen.filter((p) => p.einheitId === id);
  const typLabel = { leitung: B.leitung, stab: B.stab, abteilung: B.abteilung, referat: B.referat };
  const unitTitle = (u) => (u.typ === "abteilung" ? `${B.abteilung} ${u.kuerzel}: ${u.name}` : u.typ === "referat" ? `${B.referat} ${u.kuerzel}: ${u.name}` : u.name);
  const unitShort = (u) => (u.typ === "abteilung" ? `${B.abteilungKurz} ${u.kuerzel}` : u.typ === "referat" ? `${B.referatKurz} ${u.kuerzel}` : u.name);
  const abteilungOf = (u) => { let x = u; while (x && x.typ === "referat") x = E[x.parentId]; return x; };
  const url = { person: (id) => `${VP}personen/${id}.html`, einheit: (id) => `${VP}organisation/${id}.html`, news: (id) => `${VP}aktuelles/${id}.html`, page: (p) => `${VP}${p}` };
  const local = (rel) => rel.slice(VP.length);
  const unitTasks = (id) => aufgaben.filter((a) => a.einheitIds.includes(id));
  const unitNews = (id) => news.filter((n) => n.einheitId === id || children(id).some((c) => c.id === n.einheitId));
  const personNews = (id) => news.filter((n) => n.personIds.includes(id));
  const standortAddr = (s) => `${s.strasse}, ${s.plz} ${s.ort}`;
  const leitung = P[behoerde.leitungPersonId];
  const vertretung = P[E.leitung.vertretungPersonId];
  const presse = P[behoerde.pressePersonId];
  const datenschutz = P[behoerde.datenschutzPersonId];
  const hs = S[behoerde.hauptsitzId];
  const abteilungen = einheiten.filter((u) => u.typ === "abteilung");
  const stabs = einheiten.filter((u) => u.typ === "stab");
  const referate = einheiten.filter((u) => u.typ === "referat");
  const touch = VID === "de" ? "apple-touch-icon.png" : behoerde.logo.png.replace(/-logo\.png$/, "-touch.png");

  const icons = {
    doc: '<path d="M6 2h8l4 4v16H6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 11h6M9 15h6" stroke="currentColor" stroke-width="2"/>',
    org: '<rect x="9" y="2" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="16" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="16" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5M5 16v-4h14v4" fill="none" stroke="currentColor" stroke-width="2"/>',
    people: '<circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 4a4 4 0 0 1 0 8M18 15c2.5.6 4 2.6 4 6" fill="none" stroke="currentColor" stroke-width="2"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" fill="none" stroke="currentColor" stroke-width="2"/>',
  };
  const icon = (n) => `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[n]}</svg></span>`;

  // ---------- JSON-LD ----------
  const orgRef = { "@type": "GovernmentOrganization", "@id": `${abs(url.page(""))}#organisation`, name: behoerde.name };
  const postal = (s) => ({ "@type": "PostalAddress", streetAddress: s.strasse, postalCode: s.plz, addressLocality: s.ort, addressCountry: VID.toUpperCase() });
  function ldOrganisation(full = false) {
    const sub = (id) => children(id).map((u) => ({ "@type": "GovernmentOrganization", "@id": abs(url.einheit(u.id)), name: unitTitle(u), url: abs(url.einheit(u.id)), ...(u.leitungPersonId ? { employee: { "@type": "Person", "@id": abs(url.person(u.leitungPersonId)), name: fullName(P[u.leitungPersonId]), jobTitle: P[u.leitungPersonId].funktion } } : {}), ...(full && children(u.id).length ? { subOrganization: sub(u.id) } : {}) }));
    return {
      "@context": "https://schema.org", ...orgRef, alternateName: [behoerde.kurzname, ...(behoerde.namenLandessprachen || []).filter((n) => n.sprache !== "de").map((n) => n.name)], url: abs(url.page("")), logo: abs(behoerde.logo.png),
      description: behoerde.auftrag, foundingDate: behoerde.gruendung, telephone: behoerde.kontakt.telefon, email: behoerde.kontakt.email, areaServed: behoerde.land,
      address: postal(hs), location: standorte.map((s) => ({ "@type": "Place", name: s.name, address: postal(s) })),
      disambiguatingDescription: behoerde.hinweis, ...(full ? { subOrganization: sub("leitung") } : {}),
    };
  }
  const ldPerson = (p) => ({ "@context": "https://schema.org", "@type": "Person", "@id": abs(url.person(p.id)), name: fullName(p), givenName: p.vorname, familyName: p.nachname, honorificPrefix: p.titel || undefined, honorificSuffix: p.titelNach || undefined, jobTitle: p.funktion, email: p.email, telephone: p.telefon, image: abs(portrait(p)), url: abs(url.person(p.id)), description: p.kurzvita, worksFor: { "@type": "GovernmentOrganization", name: unitTitle(E[p.einheitId]), url: abs(url.einheit(p.einheitId)), parentOrganization: orgRef } });
  const ldNews = (n) => ({ "@context": "https://schema.org", "@type": "NewsArticle", "@id": abs(url.news(n.id)), headline: n.titel, description: n.teaser, datePublished: n.datum, image: abs(n.bild), articleSection: n.kategorie, articleBody: plain(n.text), wordCount: plain(n.text).split(/\s+/).length, inLanguage: LOCALE, author: orgRef, publisher: orgRef, mentions: n.personIds.map((id) => ({ "@type": "Person", name: fullName(P[id]), url: abs(url.person(id)) })) });
  const ldBreadcrumbs = (crumbs) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: abs(c[1]) })) });

  // ---------- Layout ----------
  const NAV = [["index.html", "Startseite"], ["ueber-uns.html", "Über uns"], ...(SZ ? [["auftrag.html", "Auftrag"]] : []), ["organisation.html", "Organisation"], ["personen.html", "Personen"], ["aufgaben.html", "Aufgaben"], ["aktuelles.html", "Aktuelles"], ["service.html", "Service"], ["presse.html", "Presse"]];
  const brandName = esc(behoerde.name).replace(" für ", " für<br>");
  function page({ rel, title, description, active, crumbs = [], body, jsonld = [], alternate }) {
    const depth = rel.split("/").length - 1;
    const b = "../".repeat(depth);
    const localRel = local(rel);
    const isHome = localRel === "index.html";
    const allCrumbs = isHome ? [] : [["Startseite", url.page("index.html")], ...crumbs];
    const ld = [...jsonld, ...(allCrumbs.length ? [ldBreadcrumbs(allCrumbs)] : [])];
    const fullTitle = isHome ? `${behoerde.name} (${behoerde.kurzname})` : `${title} – ${behoerde.kurzname}`;
    const hreflang = COMMON_PAGES.includes(localRel) ? VARIANT_META.map((m) => `<link rel="alternate" hreflang="${m.locale}" href="${abs(m.pfad + localRel)}">`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${abs("")}">\n` : "";
    const switcher = VARIANT_META.map((m) => `<a href="@/${m.pfad}${COMMON_PAGES.includes(localRel) ? localRel : "index.html"}" lang="${m.locale}" title="${esc(m.land)}: ${esc(m.name)}"${m.id === VID ? ' aria-current="true" class="is-current"' : ""}>${m.id.toUpperCase()}</a>`).join("");
    const html = `<!doctype html>
<html lang="${LOCALE}" data-variant="${VID}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, follow">
<meta name="generator" content="BAbA static build ${BUILD_DATE}">
<meta name="baba:variante" content="${VID}">
<meta name="baba:hinweis" content="${esc(behoerde.hinweis)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${abs(behoerde.logo.png)}">
<link rel="canonical" href="${abs(rel)}">
${hreflang}<link rel="icon" href="@/${behoerde.logo.farbig}" type="image/svg+xml">
<link rel="apple-touch-icon" href="@/${touch}">
<link rel="alternate" type="application/json" href="@/${VP}api/index.json" title="Maschinenlesbare Schnittstelle">
${alternate ? `<link rel="alternate" type="application/json" href="@/${VP}${alternate}" title="Inhalt dieser Seite als JSON">\n` : ""}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="@/assets/css/style.css">
${ld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
<div class="demo-banner" role="note"><strong>Fiktive Behörde:</strong> ${esc(behoerde.hinweis.replace(/^Fiktive Behörde – /, ""))}</div>
<div class="topbar"><div class="container"><a href="@/${VP}barrierefreiheit.html">Barrierefreiheit</a><a href="@/${VP}daten.html">Offene Daten &amp; API</a><a href="@/${VP}kontakt.html">Kontakt</a><a href="@/${VP}suche.html">Suche</a><nav class="variant-switch" aria-label="Länderversion">${switcher}</nav></div></div>
<header class="site-header"><div class="container">
<a class="brand" href="@/${VP}index.html" aria-label="${esc(behoerde.name)} – zur Startseite"><img src="@/${behoerde.logo.farbig}" alt="" width="64" height="64"><span class="brand-text"><span class="brand-name">${brandName}</span><span class="brand-short">${esc(behoerde.markeZeile || behoerde.kurzname)}</span></span></a>
<div class="header-search" role="search"><form action="@/${VP}suche.html"><label class="visually-hidden" for="kopfsuche">Suche</label><input id="kopfsuche" name="q" type="search" placeholder="Suchbegriff eingeben"><button type="submit">Suchen</button></form></div>
<button class="nav-toggle" aria-expanded="false" aria-controls="hauptnavigation">☰ Menü</button>
</div></header>
<nav class="main-nav" id="hauptnavigation" aria-label="Hauptnavigation"><div class="container"><ul>
${NAV.map(([href, label]) => `<li><a href="@/${VP}${href}"${active === href ? ' aria-current="page"' : ""}>${label}</a></li>`).join("\n")}
</ul></div></nav>
${allCrumbs.length ? `<nav class="breadcrumbs" aria-label="Brotkrumennavigation"><div class="container"><ol>${allCrumbs.map((c, i) => (i === allCrumbs.length - 1 ? `<li aria-current="page">${esc(c[0])}</li>` : `<li><a href="@/${c[1]}">${esc(c[0])}</a></li>`)).join("")}</ol></div></nav>` : ""}
<main id="inhalt">
${body}
</main>
<footer class="site-footer">
<div class="container">
<div class="footer-grid">
<div><div class="footer-brand"><img src="@/${behoerde.logo.negativ}" alt="" width="44" height="44">${esc(behoerde.name)}</div>
<p>${esc(hs.strasse)}<br>${esc(hs.plz)} ${esc(hs.ort)}<br>Telefon ${esc(behoerde.kontakt.telefon)}<br><a href="mailto:${esc(behoerde.kontakt.email)}">${esc(behoerde.kontakt.email)}</a></p></div>
<div><h2>Das Amt</h2><ul><li><a href="@/${VP}ueber-uns.html">Über uns</a></li>${SZ ? `<li><a href="@/${VP}auftrag.html">Auftrag und Zuständigkeit</a></li>` : ""}<li><a href="@/${VP}organisation.html">Organigramm</a></li><li><a href="@/${VP}personen.html">Ansprechpersonen</a></li><li><a href="@/${VP}aufgaben.html">Aufgaben</a></li></ul></div>
<div><h2>Service</h2><ul><li><a href="@/${VP}service.html">Formulare &amp; Downloads</a></li><li><a href="@/${VP}aktuelles.html">Aktuelles</a></li><li><a href="@/${VP}presse.html">Presse</a></li><li><a href="@/${VP}kontakt.html">Kontakt</a></li></ul></div>
<div><h2>Rechtliches</h2><ul><li><a href="@/${VP}impressum.html">Impressum</a></li><li><a href="@/${VP}datenschutz.html">Datenschutz</a></li><li><a href="@/${VP}barrierefreiheit.html">Barrierefreiheit</a></li><li><a href="@/${VP}daten.html">Offene Daten &amp; API</a></li></ul></div>
</div>
<div class="footer-bottom"><span>© ${new Date().getFullYear()} ${esc(behoerde.name)} (fiktiv) · Länderversion ${esc(behoerde.land)}</span><span class="machine-hint">Maschinenlesbar: <a href="@/${VP}api/index.json"><code>api/index.json</code></a> · <a href="@/${VP}llms.txt"><code>llms.txt</code></a></span></div>
</div>
<div class="footer-fiction">${esc(behoerde.fiktivFooter)}</div>
</footer>
<script src="@/assets/js/app.js" defer></script>
</body>
</html>
`;
    const out = swiss(html.replace(/(href|src|action|data-base)="@\//g, `$1="${b}`));
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out);
    written.push(rel);
  }

  // ---------- Bausteine ----------
  const personCard = (p) => `<article class="card person-card"><img src="@/${portrait(p)}" alt="Porträt ${esc(fullName(p))}" loading="lazy" width="640" height="800"><div class="card-body"><h3><a href="@/${url.person(p.id)}">${esc(fullName(p))}</a></h3><div class="person-role">${esc(p.funktion)}</div><div class="person-unit">${esc(unitTitle(E[p.einheitId]))}</div></div></article>`;
  const newsCard = (n) => `<article class="card"><img src="@/${n.bild}" alt="" loading="lazy" width="1400" height="788"><div class="card-body"><div class="meta"><time datetime="${n.datum}">${fmtDate(n.datum)}</time><span class="tag">${esc(n.kategorie)}</span></div><h3><a href="@/${url.news(n.id)}">${esc(n.titel)}</a></h3><p>${esc(n.teaser)}</p><a class="more" href="@/${url.news(n.id)}" aria-label="Weiterlesen: ${esc(n.titel)}">Weiterlesen</a></div></article>`;
  const unitLink = (id) => `<a href="@/${url.einheit(id)}">${esc(unitTitle(E[id]))}</a>`;
  const taskCard = (a) => `<article class="card task"><div class="card-body"><span class="tag tag-gold">${esc(a.kategorie)}</span><h3 style="margin-top:.5em"><a href="@/${VP}aufgaben.html#${a.id}">${esc(a.titel)}</a></h3><p>${esc(a.beschreibung)}</p><div class="meta">Rechtsgrundlage: ${esc(a.rechtsgrundlage)}</div><div class="units">${a.einheitIds.map((id) => `<a class="tag" href="@/${url.einheit(id)}">${esc(unitShort(E[id]))}</a>`).join("")}</div></div></article>`;
  const para = (t) => (t.startsWith("## ") ? `<h2>${esc(t.slice(3))}</h2>` : `<p>${esc(t)}</p>`);
  const plain = (arr) => arr.filter((t) => !t.startsWith("## ")).join("\n\n");
  const taskDetail = (a) => `<article class="task-detail" id="${a.id}"><span class="tag tag-gold">${esc(a.kategorie)}</span><h3>${esc(a.titel)}</h3><p class="task-lead">${esc(a.beschreibung)}</p>
${(a.details || []).map(para).join("")}${a.beispiele?.length ? `<h4>Typische Fälle</h4><ul class="checklist">${a.beispiele.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
<dl class="facts facts-compact">${a.leistung ? [["Einreichung", a.leistung.antrag], ["Bearbeitungsdauer", a.leistung.dauer], ["Kosten", a.leistung.kosten]].filter(([, v]) => v).map(([kk, v]) => `<div><dt>${kk}</dt><dd>${esc(v)}</dd></div>`).join("") : ""}<div><dt>Rechtsgrundlage</dt><dd>${esc(a.rechtsgrundlage)}</dd></div><div><dt>Zuständig</dt><dd>${a.einheitIds.map(unitLink).join(", ")}</dd></div></dl></article>`;
  const orgBox = (u, cls = "") => { const l = P[u.leitungPersonId]; return `<div class="org-box ${cls}"><a href="@/${url.einheit(u.id)}">${u.typ === "referat" ? `<span class="org-kuerzel">${esc(u.kuerzel)}</span>` : ""}${esc(u.name)}</a>${l ? `<span class="lead-name">${esc(fullName(l))}</span>` : ""}</div>`; };
  const newsList = (list) => `<ul class="list-plain">${list.map((n) => `<li><time datetime="${n.datum}">${fmtDate(n.datum)}</time> – <a href="@/${url.news(n.id)}">${esc(n.titel)}</a></li>`).join("")}</ul>`;

  // ---------- Seiten ----------
  page({
    rel: url.page("index.html"), active: "index.html", title: "Startseite", description: behoerde.claim,
    jsonld: [ldOrganisation(), { "@context": "https://schema.org", "@type": "WebSite", name: behoerde.name, inLanguage: LOCALE, url: abs(url.page("")), potentialAction: { "@type": "SearchAction", target: `${abs(url.page("suche.html"))}?q={q}`, "query-input": "required name=q" } }],
    alternate: "api/behoerde.json",
    body: `<section class="hero" aria-labelledby="hero-titel"><img src="@/${behoerde.hero.bild}" alt="${esc(behoerde.hero.alt)}" width="2400" height="1029" fetchpriority="high">
<div class="container"><span class="hero-kicker">${esc(behoerde.typ)} · seit ${behoerde.gruendung.slice(0, 4)}</span><h1 id="hero-titel">${esc(behoerde.claim)}</h1><p>${esc(behoerde.auftrag.split(". ")[0])}.</p>
<div class="btn-row">${SZ ? `<a class="btn btn-primary" href="@/${VP}auftrag.html">Wofür wir da sind</a><a class="btn btn-ghost" href="@/${VP}aufgaben.html">Unsere Aufgaben</a>` : `<a class="btn btn-primary" href="@/${VP}aufgaben.html">Unsere Aufgaben</a><a class="btn btn-ghost" href="@/${VP}service.html">${esc(B.antraegeButton)}</a>`}</div></div></section>
<section class="quick" aria-label="Schnellzugriff"><div class="container"><div class="quick-grid">
<a href="@/${VP}service.html">${icon("doc")}<div><strong>${esc(B.antraegeTitel)}</strong><span>${esc(B.antraegeText)}</span></div></a>
<a href="@/${VP}organisation.html">${icon("org")}<div><strong>Organisation</strong><span>Organigramm mit ${abteilungen.length} ${esc(B.abteilungPlural)} und ${referate.length} ${esc(B.referatPlural)}</span></div></a>
<a href="@/${VP}personen.html">${icon("people")}<div><strong>Ansprechpersonen</strong><span>Leitung und ${esc(B.referatsleitungen)}</span></div></a>
<a href="@/${VP}daten.html">${icon("data")}<div><strong>Offene Daten</strong><span>Alle Inhalte als JSON-Schnittstelle</span></div></a>
</div></div></section>
${SZ ? `<section class="section"><div class="container mission"><div><div class="eyebrow">Wofür wir da sind</div><h2>${esc(SZ.titel)}</h2><p class="lead">${esc(SZ.kurzfassung)}</p><p>${esc(SZ.einleitung[0])}</p><div class="btn-row"><a class="btn btn-primary" href="@/${VP}auftrag.html">Mehr über unseren Auftrag</a></div></div><div class="aside-box"><h3>Wir sind zuständig für</h3><ul class="checklist">${SZ.zustaendig.slice(0, 5).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></section>` : ""}
<section class="section section-soft"><div class="container"><div class="section-head"><div><div class="eyebrow">Aktuelles</div><h2>Neuigkeiten aus dem Amt</h2></div><a class="btn btn-outline" href="@/${VP}aktuelles.html">Alle Meldungen</a></div>
<div class="grid grid-3">${news.slice(0, 3).map(newsCard).join("")}</div></div></section>
<section class="section"><div class="container"><div class="section-head"><div><div class="eyebrow">Das ${esc(behoerde.kurzname)} in Zahlen</div><h2>Besonders. Seit ${behoerde.gruendung.slice(0, 4)}.</h2></div></div>
<div class="stats">${behoerde.kennzahlen.map((k) => `<div class="stat"><div class="stat-value">${esc(k.wert)}</div><div class="stat-label">${esc(k.label)}</div></div>`).join("")}</div></div></section>
<section class="section section-soft"><div class="container"><div class="section-head"><div><div class="eyebrow">Was wir tun</div><h2>Aufgaben im Überblick</h2></div><a class="btn btn-outline" href="@/${VP}aufgaben.html">Alle Aufgaben</a></div>
<div class="grid grid-3">${aufgaben.filter((a) => a.kategorie === "Kernaufgabe").slice(0, 3).map(taskCard).join("")}</div></div></section>
<section class="section"><div class="container greeting"><img src="@/${portrait(leitung)}" alt="Porträt ${esc(fullName(leitung))}" width="640" height="800" loading="lazy">
<div><div class="eyebrow">${esc(behoerde.grusswort.titel)}</div><h2>Willkommen beim ${esc(behoerde.kurzname)}</h2><blockquote><p>${VID === "ch" ? "«" : "„"}${esc(behoerde.grusswort.text)}${VID === "ch" ? "»" : "“"}</p></blockquote>
<p><strong><a href="@/${url.person(leitung.id)}">${esc(fullName(leitung))}</a></strong><br>${esc(leitung.funktion)}, ${esc(behoerde.name)}</p></div></div></section>
`,
  });

  page({
    rel: url.page("ueber-uns.html"), active: "ueber-uns.html", title: "Über uns", description: behoerde.auftrag, crumbs: [["Über uns", url.page("ueber-uns.html")]], jsonld: [ldOrganisation()], alternate: "api/behoerde.json",
    body: `<section class="hero" style="min-height:0"><img src="@/${behoerde.heroInnen.bild}" alt="${esc(behoerde.heroInnen.alt)}" width="2400" height="1029"><div class="container" style="padding-bottom:64px"><span class="hero-kicker">Über uns</span><h1>${esc(behoerde.name)}</h1><p>${esc(behoerde.zuordnung)}</p></div></section>
<section class="section"><div class="container layout-aside"><div>
<h2>Unser Auftrag</h2><p class="lead">${esc(behoerde.auftrag)}</p>
<h2 style="margin-top:1.5em">Rechtsgrundlage</h2><p>Grundlage unserer Arbeit ist das <strong>${esc(behoerde.rechtsgrundlage.titel)}</strong> (${esc(behoerde.rechtsgrundlage.fundstelle)}).</p>
<h2 style="margin-top:1.5em">Leitbild</h2><div class="grid grid-2">${behoerde.leitbild.map((l) => `<div class="card"><div class="card-body"><h3>${esc(l.titel)}</h3><p>${esc(l.text)}</p></div></div>`).join("")}</div>
<h2 style="margin-top:1.5em">Geschichte</h2><ol class="timeline">${behoerde.geschichte.map((g) => `<li><strong>${esc(g.jahr)}</strong>${esc(g.ereignis)}</li>`).join("")}</ol>
</div><aside>
<div class="aside-box"><h2>Auf einen Blick</h2><dl class="facts" style="margin:0"><div><dt>Gründung</dt><dd>${fmtDate(behoerde.gruendung)}</dd></div><div><dt>Leitung</dt><dd><a href="@/${url.person(leitung.id)}">${esc(fullName(leitung))}</a></dd></div><div><dt>Hauptsitz</dt><dd>${esc(hs.ort)}</dd></div>${behoerde.kennzahlen.map((k) => `<div><dt>${esc(k.label)}</dt><dd>${esc(k.wert)}</dd></div>`).join("")}</dl></div>
<div class="aside-box"><h2>Weiterführend</h2><ul class="list-plain">${SZ ? `<li><a href="@/${VP}auftrag.html">Auftrag und Zuständigkeit</a></li>` : ""}<li><a href="@/${VP}organisation.html">Organigramm</a></li><li><a href="@/${VP}aufgaben.html">Aufgaben</a></li><li><a href="@/${VP}service.html">Jahresbericht</a></li></ul></div>
</aside></div></section>
<section class="section section-soft"><div class="container"><h2>Unsere Standorte</h2><div class="grid grid-3">${standorte.map((s) => `<article class="card" id="${s.id}"><img src="@/${s.bild}" alt="${esc(s.name)}" loading="lazy" width="1400" height="933"><div class="card-body"><span class="tag">${esc(s.typ)}</span><h3 style="margin-top:.5em">${esc(s.name)}</h3><p>${esc(standortAddr(s))}<br>Telefon ${esc(s.telefon)}</p><p>${esc(s.beschreibung)}</p></div></article>`).join("")}</div></div></section>`,
  });

  // Organisation
  const dl = Object.fromEntries(downloads.map((d) => [d.art === "formular" ? d.id : d.art, d]));
  page({
    rel: url.page("organisation.html"), active: "organisation.html", title: "Organisation und Organigramm", description: `Aufbauorganisation des ${behoerde.name}: ${B.leitung}, ${B.stabPlural}, ${abteilungen.length} ${B.abteilungPlural} und ihre ${B.referatPlural}.`, crumbs: [["Organisation", url.page("organisation.html")]], jsonld: [ldOrganisation(true)], alternate: "api/organisation.json",
    body: `<div class="container page-head"><div class="eyebrow">Aufbauorganisation</div><h1>Organigramm</h1><p class="lead">Stand: ${fmtDate(org.stand)}. Wählen Sie eine Organisationseinheit, um Leitung, Aufgaben und Ansprechpersonen zu sehen.</p>
<div class="btn-row" style="margin:0 0 8px"><button class="btn btn-outline" type="button" data-org-toggle="open">Alle aufklappen</button><button class="btn btn-outline" type="button" data-org-toggle="close">Alle zuklappen</button><a class="btn btn-outline" href="@/${dl.organigramm.datei}" download>Organigramm herunterladen (SVG)</a></div>
<div class="org-legend"><span>■ ${esc(B.leitung)}</span><span class="legend-stab">▭ ${esc(B.stab)} (gestrichelt)</span><span>▬ ${esc(B.abteilung)} mit ${esc(B.referatPlural)}</span></div></div>
<section class="container" aria-label="Organigramm">
<div class="org-leitung">${[leitung, vertretung].map((p) => `<div class="org-person"><img src="@/${portrait(p)}" alt=""><div><a href="@/${url.person(p.id)}"><strong>${esc(fullName(p))}</strong></a><small>${esc(p.funktion)}</small></div></div>`).join("")}</div>
<div class="org-stab">${stabs.map((u) => orgBox(u, "org-box-stab")).join("")}</div>
<div class="org-abteilungen">${abteilungen.map((a) => `<details class="org-abt" open><summary><span class="tag">${esc(B.abteilung)} ${esc(a.kuerzel)}</span><strong>${esc(a.name)}</strong><span class="lead-name" style="font-size:.88rem;color:var(--muted)">${esc(fullName(P[a.leitungPersonId]))} · ${esc(S[a.standortId].ort)}</span></summary><div class="refs"><a class="more" href="@/${url.einheit(a.id)}" style="font-size:.9rem">Zur ${esc(B.abteilung)}</a>${children(a.id).map((r) => orgBox(r)).join("")}</div></details>`).join("")}</div>
</section>
<section class="section"><div class="container"><h2>Alle Organisationseinheiten</h2><div class="table-wrap"><table><thead><tr><th>Kürzel</th><th>Einheit</th><th>Typ</th><th>Leitung</th><th>Standort</th></tr></thead><tbody>
${einheiten.map((u) => `<tr><td>${esc(u.kuerzel)}</td><td>${unitLink(u.id)}</td><td>${esc(typLabel[u.typ])}</td><td>${u.leitungPersonId ? `<a href="@/${url.person(u.leitungPersonId)}">${esc(fullName(P[u.leitungPersonId]))}</a>` : "–"}</td><td>${esc(S[u.standortId].ort)}</td></tr>`).join("\n")}
</tbody></table></div></div></section>`,
  });

  for (const u of einheiten) {
    const lead = P[u.leitungPersonId];
    const parent = E[u.parentId];
    const kids = children(u.id);
    const st = S[u.standortId];
    const tasks = unitTasks(u.id);
    const rel = unitNews(u.id);
    const members = unitPersons(u.id);
    const crumbs = [["Organisation", url.page("organisation.html")]];
    if (parent && parent.typ === "abteilung") crumbs.push([unitTitle(parent), url.einheit(parent.id)]);
    crumbs.push([unitTitle(u), url.einheit(u.id)]);
    page({
      rel: url.einheit(u.id), active: "organisation.html", title: unitTitle(u), description: `${unitTitle(u)} im ${behoerde.name}${u.beschreibung ? ": " + u.beschreibung : ""}`, crumbs, alternate: `api/einheiten/${u.id}.json`,
      jsonld: [{ "@context": "https://schema.org", "@type": "GovernmentOrganization", "@id": abs(url.einheit(u.id)), name: unitTitle(u), alternateName: u.kuerzel, description: u.beschreibung, parentOrganization: parent ? { "@type": "GovernmentOrganization", name: unitTitle(parent), url: abs(url.einheit(parent.id)) } : orgRef, address: postal(st), ...(members.length ? { employee: members.map((p) => ({ "@type": "Person", name: fullName(p), jobTitle: p.funktion, url: abs(url.person(p.id)) })) } : {}), ...(kids.length ? { subOrganization: kids.map((k) => ({ "@type": "GovernmentOrganization", name: unitTitle(k), url: abs(url.einheit(k.id)) })) } : {}) }],
      body: `<div class="container page-head"><div class="eyebrow">${esc(typLabel[u.typ])}${u.kuerzel ? " " + esc(u.kuerzel) : ""}</div><h1>${esc(u.name)}</h1>${u.beschreibung ? `<p class="lead">${esc(u.beschreibung)}</p>` : ""}</div>
<section class="section" style="padding-top:16px"><div class="container layout-aside"><div>
<dl class="facts"><div><dt>Organisationseinheit</dt><dd>${esc(unitTitle(u))} (${esc(typLabel[u.typ])})</dd></div><div><dt>Übergeordnet</dt><dd>${parent ? unitLink(parent.id) : esc(behoerde.geschaeftsbereich)}</dd></div>
<div><dt>Leitung</dt><dd>${lead ? `<a href="@/${url.person(lead.id)}">${esc(fullName(lead))}</a>, ${esc(lead.funktion)}` : "–"}</dd></div>${u.vertretungPersonId ? `<div><dt>Vertretung</dt><dd><a href="@/${url.person(u.vertretungPersonId)}">${esc(fullName(P[u.vertretungPersonId]))}</a></dd></div>` : ""}
<div><dt>Standort</dt><dd>${esc(st.name)}, ${esc(standortAddr(st))}</dd></div>${lead ? `<div><dt>Kontakt</dt><dd>Telefon ${esc(lead.telefon)}<br><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></dd></div>` : ""}</dl>
${kids.length ? `<h2>Untergeordnete Einheiten</h2><div class="grid grid-2" style="margin-bottom:32px">${kids.map((k) => orgBox(k, k.typ === "stab" ? "org-box-stab" : "")).join("")}</div>` : ""}
${tasks.length ? `<h2>Aufgaben</h2><div class="grid grid-2" style="margin-bottom:32px">${tasks.map(taskCard).join("")}</div>` : ""}
${rel.length ? `<h2>Meldungen</h2>${newsList(rel)}` : ""}
</div><aside>${members.length ? `<div class="aside-box"><h2>Ansprechpersonen</h2><div class="grid">${members.map(personCard).join("")}</div></div>` : ""}</aside></div></section>`,
    });
  }

  // Personen
  const personGroups = [[B.leitung, ["leitung"]], [B.stabPlural, stabs.map((u) => u.id)], ...abteilungen.map((a) => [unitTitle(a), [a.id, ...children(a.id).map((c) => c.id)]])];
  page({
    rel: url.page("personen.html"), active: "personen.html", title: "Ansprechpersonen", description: `Leitung sowie ${B.referatsleitungen} des ${behoerde.name}.`, crumbs: [["Personen", url.page("personen.html")]], alternate: "api/personen.json",
    jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", name: "Ansprechpersonen", itemListElement: personen.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(url.person(p.id)), name: fullName(p) })) }],
    body: `<div class="container page-head"><div class="eyebrow">Personen</div><h1>Ansprechpersonen</h1><p class="lead">Die Leitung des Amtes sowie die Leitungen aller ${esc(B.abteilungPlural)}, ${esc(B.referatPlural)} und ${esc(B.stabPlural)}.</p></div>
${personGroups.map(([title, ids]) => `<section class="section" style="padding:24px 0"><div class="container"><h2>${esc(title)}</h2><div class="grid grid-4">${personen.filter((p) => ids.includes(p.einheitId)).map(personCard).join("")}</div></div></section>`).join("")}`,
  });

  for (const p of personen) {
    const u = E[p.einheitId];
    const abt = abteilungOf(u);
    const st = S[u.standortId];
    const pn = personNews(p.id);
    const leads = einheiten.filter((x) => x.leitungPersonId === p.id);
    page({
      rel: url.person(p.id), active: "personen.html", title: `${fullName(p)} – ${p.funktion}`, description: `${fullName(p)}, ${p.funktion}, ${unitTitle(u)}. ${p.kurzvita}`, crumbs: [["Personen", url.page("personen.html")], [fullName(p), url.person(p.id)]],
      jsonld: [ldPerson(p)], alternate: `api/personen/${p.id}.json`,
      body: `<section class="section"><div class="container person-hero"><img src="@/${portrait(p)}" alt="Porträt ${esc(fullName(p))}" width="640" height="800">
<div><div class="eyebrow">${esc(p.funktion)}</div><h1>${esc(fullName(p))}</h1><p class="lead">${esc(p.kurzvita)}</p>
<dl class="facts"><div><dt>Funktion</dt><dd>${esc(p.funktion)}</dd></div><div><dt>Organisationseinheit</dt><dd>${unitLink(u.id)}</dd></div>${abt && abt.id !== u.id && abt.typ === "abteilung" ? `<div><dt>${esc(B.abteilung)}</dt><dd>${unitLink(abt.id)}</dd></div>` : ""}
${leads.length ? `<div><dt>Leitet</dt><dd>${leads.map((x) => unitLink(x.id)).join("<br>")}</dd></div>` : ""}
<div><dt>Telefon</dt><dd><a href="tel:${esc(p.telefon.replace(/[^+\d]/g, ""))}">${esc(p.telefon)}</a></dd></div><div><dt>E-Mail</dt><dd><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd></div>
<div><dt>Dienstort</dt><dd>${esc(st.name)}<br>${esc(standortAddr(st))}</dd></div></dl>
${pn.length ? `<h2>Erwähnt in</h2>${newsList(pn)}` : ""}
</div></div></section>`,
    });
  }

  // Aufgaben
  const kategorien = [...new Set(aufgaben.map((a) => a.kategorie))];
  page({
    rel: url.page("aufgaben.html"), active: "aufgaben.html", title: "Aufgaben", description: `Aufgaben und Leistungen des ${behoerde.name}.`, crumbs: [["Aufgaben", url.page("aufgaben.html")]], alternate: "api/aufgaben.json",
    jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", name: `Aufgaben des ${behoerde.kurzname}`, itemListElement: aufgaben.map((a, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "GovernmentService", name: a.titel, description: a.beschreibung, provider: orgRef, url: abs(url.page("aufgaben.html#" + a.id)) } })) }],
    body: `<div class="container page-head"><div class="eyebrow">Was wir tun</div><h1>Aufgaben und Leistungen</h1><p class="lead">${esc(behoerde.auftrag)}</p></div>
<nav class="container toc" aria-label="Inhalt">${kategorien.map((k) => `<div><strong>${esc(k)}</strong><ul class="list-plain">${aufgaben.filter((a) => a.kategorie === k).map((a) => `<li><a href="#${a.id}">${esc(a.titel)}</a></li>`).join("")}</ul></div>`).join("")}</nav>
${kategorien.map((k) => `<section class="section" style="padding:24px 0"><div class="container"><h2>${esc(k)}</h2><div class="task-list">${aufgaben.filter((a) => a.kategorie === k).map(taskDetail).join("")}</div></div></section>`).join("")}`,
  });

  // Aktuelles
  page({
    rel: url.page("aktuelles.html"), active: "aktuelles.html", title: "Aktuelles", description: `Mitteilungen, Meldungen und Veranstaltungen des ${behoerde.kurzname}.`, crumbs: [["Aktuelles", url.page("aktuelles.html")]], alternate: "api/news.json",
    body: `<div class="container page-head"><div class="eyebrow">Aktuelles</div><h1>Meldungen und Mitteilungen</h1></div><section class="section" style="padding-top:16px"><div class="container"><div class="grid grid-3">${news.map(newsCard).join("")}</div></div></section>`,
  });
  const presseBox = `<div class="aside-box"><h2>Pressekontakt</h2><p>${esc(fullName(presse))}<br>${esc(presse.funktion)}<br>${esc(presse.telefon)}<br><a href="mailto:${esc(presse.email)}">${esc(presse.email)}</a></p></div>`;
  for (const n of news) {
    page({
      rel: url.news(n.id), active: "aktuelles.html", title: n.titel, description: n.teaser, crumbs: [["Aktuelles", url.page("aktuelles.html")], [n.titel, url.news(n.id)]], jsonld: [ldNews(n)], alternate: `api/news/${n.id}.json`,
      body: `<section class="section"><div class="container layout-aside"><article class="article"><div class="meta"><time datetime="${n.datum}">${fmtDate(n.datum)}</time><span class="tag">${esc(n.kategorie)}</span></div><h1>${esc(n.titel)}</h1><p class="lead">${esc(n.teaser)}</p>
<figure class="article-figure"><img src="@/${n.bild}" alt="" width="1400" height="788"><figcaption>Foto: ${esc(behoerde.kurzname)} (KI-generiert, fiktiv)</figcaption></figure>
${n.text.map(para).join("\n")}</article>
<aside><div class="aside-box"><h2>Zuständig</h2><p>${unitLink(n.einheitId)}</p></div><div class="aside-box"><h2>Personen in dieser Meldung</h2><ul class="list-plain">${n.personIds.map((id) => `<li><a href="@/${url.person(id)}">${esc(fullName(P[id]))}</a><br><small>${esc(P[id].funktion)}</small></li>`).join("")}</ul></div>${presseBox}</aside></div></section>`,
    });
  }

  // Service
  const dlRow = (d) => `<tr><td><a href="@/${d.datei}" download>${esc(d.titel)}</a></td><td>${esc(d.kategorie)}</td><td>${esc(d.typ)}</td><td>${unitLink(d.einheitId)}</td></tr>`;
  page({
    rel: url.page("service.html"), active: "service.html", title: "Service, Formulare und Downloads", description: `Formulare, Leistungen und Publikationen des ${behoerde.kurzname}.`, crumbs: [["Service", url.page("service.html")]], alternate: "api/downloads.json",
    body: `<div class="container page-head"><div class="eyebrow">Service</div><h1>Formulare, Leistungen und Downloads</h1><p class="lead">Die meisten Anliegen können Sie formlos oder mit den folgenden Formularen einreichen. Die digitale Einreichung befindet sich im Aufbau.</p></div>
<section class="section" style="padding-top:16px"><div class="container"><div class="grid grid-3">${aufgaben.filter((a) => a.kategorie.startsWith("Leistung")).map(taskCard).join("")}</div>
<h2 style="margin-top:48px">Downloads</h2><div class="table-wrap"><table><thead><tr><th>Dokument</th><th>Kategorie</th><th>Format</th><th>Zuständig</th></tr></thead><tbody>${downloads.map(dlRow).join("")}</tbody></table></div>
<h2 style="margin-top:48px">${esc(behoerde.kontakt.zeitenLabel)}</h2><p>${esc(behoerde.kontakt.servicezeiten)} · Telefon ${esc(behoerde.kontakt.telefon)}</p></div></section>`,
  });

  // Presse
  page({
    rel: url.page("presse.html"), active: "presse.html", title: "Presse", description: `Pressekontakt, Mitteilungen, Logos und Bildmaterial des ${behoerde.kurzname}.`, crumbs: [["Presse", url.page("presse.html")]],
    body: `<div class="container page-head"><div class="eyebrow">Presse</div><h1>Presse und Medien</h1></div>
<section class="section" style="padding-top:16px"><div class="container layout-aside"><div>
<h2>Mitteilungen</h2>${newsList(news.slice(0, 6))}
<h2 style="margin-top:40px">Logo und Bildmarke</h2><p>Die Logos dürfen ausschließlich im Zusammenhang mit Berichterstattung über das (fiktive) ${esc(behoerde.kurzname)} verwendet werden.</p>
<div class="grid grid-3"><div><div class="logo-tile"><img src="@/${behoerde.logo.farbig}" alt="Bildmarke farbig"></div><p><a href="@/${behoerde.logo.farbig}" download>SVG</a> · <a href="@/${behoerde.logo.png}" download>PNG</a></p></div>
<div><div class="logo-tile dark"><img src="@/${behoerde.logo.negativ}" alt="Bildmarke negativ"></div><p><a href="@/${behoerde.logo.negativ}" download>SVG (negativ)</a></p></div>
<div><div class="logo-tile"><img src="@/${behoerde.logo.wortbildmarke}" alt="Wort-Bildmarke"></div><p><a href="@/${behoerde.logo.wortbildmarke}" download>SVG (Wort-Bildmarke)</a></p></div></div>
<h3>Farben</h3><div class="grid grid-4">${Object.entries(behoerde.farben).map(([k, v]) => `<div class="card"><div style="height:70px;background:${v}"></div><div class="card-body"><strong>${esc(k[0].toUpperCase() + k.slice(1))}</strong><code>${v}</code></div></div>`).join("")}</div>
<h2 style="margin-top:40px">Pressebilder</h2><div class="grid grid-3">${[[behoerde.hero.bild, behoerde.hero.alt], [behoerde.heroInnen.bild, behoerde.heroInnen.alt], ...standorte.map((s) => [s.bild, s.name])].map(([src, t]) => `<figure class="card" style="margin:0"><img src="@/${src}" alt="${esc(t)}" loading="lazy"><figcaption class="card-body"><a href="@/${src}" download>${esc(t)}</a></figcaption></figure>`).join("")}</div>
</div><aside><div class="aside-box"><h2>Pressekontakt</h2><div class="org-person"><img src="@/${portrait(presse)}" alt=""><div><a href="@/${url.person(presse.id)}"><strong>${esc(fullName(presse))}</strong></a><small>${esc(presse.funktion)}</small></div></div><p style="margin-top:12px">Telefon ${esc(presse.telefon)}<br><a href="mailto:${esc(presse.email)}">${esc(presse.email)}</a></p></div></aside></div></section>`,
  });

  // Kontakt
  const k = behoerde.kontakt;
  page({
    rel: url.page("kontakt.html"), title: "Kontakt", description: `Kontakt und Anschriften des ${behoerde.kurzname}.`, crumbs: [["Kontakt", url.page("kontakt.html")]], jsonld: [ldOrganisation()], alternate: "api/standorte.json",
    body: `<div class="container page-head"><div class="eyebrow">Kontakt</div><h1>So erreichen Sie uns</h1><p class="lead">${esc(k.zeitenLabel)}: ${esc(k.servicezeiten)}</p></div>
<section class="section" style="padding-top:16px"><div class="container"><div class="grid grid-3"><div class="aside-box"><h2>Zentrale</h2><p>Telefon ${esc(k.telefon)}${k.fax ? `<br>Fax ${esc(k.fax)}` : ""}<br>E-Mail <a href="mailto:${esc(k.email)}">${esc(k.email)}</a>${k.deMail ? `<br>De-Mail ${esc(k.deMail)}` : ""}</p></div>
${standorte.map((s) => `<div class="aside-box"><h2>${esc(s.name)}</h2><p>${esc(behoerde.name)}<br>${esc(s.strasse)}<br>${esc(s.plz)} ${esc(s.ort)}<br>Telefon ${esc(s.telefon)}</p></div>`).join("")}</div>
<h2 style="margin-top:32px">Kontaktformular</h2><p>Dieses Formular ist eine Attrappe und versendet keine Daten.</p>
<form onsubmit="alert('Demo: Es werden keine Daten versendet.');return false" style="max-width:640px;display:grid;gap:12px"><label>Name<br><input style="width:100%;padding:10px" name="name"></label><label>E-Mail<br><input style="width:100%;padding:10px" type="email" name="email"></label><label>Ihr Anliegen<br><textarea style="width:100%;padding:10px" rows="5" name="text"></textarea></label><button class="btn btn-primary" type="submit" style="justify-self:start;border:0">Absenden (Demo)</button></form></div></section>`,
  });

  const simple = (p, title, html) => page({ rel: url.page(p), title, description: `${title} – ${behoerde.name} (fiktiv)`, crumbs: [[title, url.page(p)]], body: `<section class="section"><div class="container article"><h1>${esc(title)}</h1>${html}</div></section>` });
  simple("impressum.html", "Impressum", `<p><strong>Hinweis:</strong> ${esc(behoerde.hinweis)}</p>${VID === "at" ? "<p>Offenlegung gemäß § 25 Mediengesetz (fiktiv).</p>" : ""}<h2>${VID === "at" ? "Medieninhaber und Herausgeber" : "Herausgeber"}</h2><p>${esc(behoerde.name)}<br>${esc(hs.strasse)}<br>${esc(hs.plz)} ${esc(hs.ort)}</p><p>Telefon ${esc(k.telefon)}<br>E-Mail ${esc(k.email)}</p><h2>Vertretungsberechtigt</h2><p>${esc(fullName(leitung))}, ${esc(leitung.funktion)}</p><h2>Verantwortlich für den Inhalt</h2><p>${esc(fullName(presse))}, ${esc(presse.funktion)}</p><h2>Bildnachweis</h2><p>Sämtliche Fotos und Porträts wurden mit KI (Higgsfield) erzeugt und zeigen keine realen Personen. Gebäude und Orte sind frei nachempfunden.</p>`);
  simple("datenschutz.html", "Datenschutzerklärung", `<p>Diese Demonstrations-Website erhebt keine personenbezogenen Daten, setzt keine Cookies und verwendet keine Analysewerkzeuge. Schriftarten werden von Google Fonts geladen; dabei wird Ihre IP-Adresse an Google übermittelt.</p><h2>${esc(datenschutz.funktion)} (fiktiv)</h2><p>${esc(fullName(datenschutz))}<br>${esc(datenschutz.email)}</p>`);
  simple("barrierefreiheit.html", "Erklärung zur Barrierefreiheit", `<p>Das ${esc(behoerde.kurzname)} ist bemüht, seine Website im Einklang mit ${ACCESSIBILITY_LAW[VID]} barrierefrei zugänglich zu machen.</p><h2>Stand der Vereinbarkeit</h2><p>Diese Website ist weitgehend mit den Anforderungen vereinbar. Sie bietet semantisches HTML, Sprunglinks, ausreichende Kontraste, Tastaturbedienbarkeit und Alternativtexte.</p><h2>Nicht barrierefreie Inhalte</h2><p>Die PDF-Downloads sind Platzhalter und nicht vollständig barrierefrei.</p><h2>Feedback</h2><p>${esc(k.email)}</p>`);
  page({
    rel: url.page("suche.html"), title: "Suche", description: "Volltextsuche über Personen, Organisationseinheiten, Aufgaben und Meldungen.", crumbs: [["Suche", url.page("suche.html")]],
    body: `<section class="section"><div class="container"><h1>Suche</h1><form class="search-box" role="search" onsubmit="return false"><label class="visually-hidden" for="suchbegriff">Suchbegriff</label><input id="suchbegriff" type="search" placeholder="${esc(SEARCH_EXAMPLE[VID])}" autofocus><button type="submit">Suchen</button></form><div id="suchergebnisse" data-base="@/${VP}" aria-live="polite"></div><noscript><p>Die Suche benötigt JavaScript. Alle Inhalte finden Sie auch über die <a href="@/${VP}api/index.json">JSON-Schnittstelle</a>.</p></noscript></div></section>`,
  });

  // ---------- Maschinenlesbare API ----------
  const writeJson = (rel, obj) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, swiss(JSON.stringify(obj, null, 2)) + "\n"); written.push(rel); };
  const personOut = (p) => ({ ...p, name: fullName(p), portrait: portrait(p), portraitUrl: abs(portrait(p)), url: abs(url.person(p.id)), einheit: { id: p.einheitId, name: unitTitle(E[p.einheitId]), url: abs(url.einheit(p.einheitId)) }, abteilungId: abteilungOf(E[p.einheitId])?.id, standortId: E[p.einheitId].standortId, leitetEinheitIds: einheiten.filter((u) => u.leitungPersonId === p.id).map((u) => u.id), json: abs(`${VP}api/personen/${p.id}.json`) });
  const unitOut = (u) => ({ ...u, titel: unitTitle(u), typLabel: typLabel[u.typ], url: abs(url.einheit(u.id)), leitung: u.leitungPersonId ? { id: u.leitungPersonId, name: fullName(P[u.leitungPersonId]), funktion: P[u.leitungPersonId].funktion } : null, childIds: children(u.id).map((c) => c.id), personIds: unitPersons(u.id).map((p) => p.id), aufgabeIds: unitTasks(u.id).map((a) => a.id), json: abs(`${VP}api/einheiten/${u.id}.json`) });
  const newsOut = (n) => ({ ...n, url: abs(url.news(n.id)), bildUrl: abs(n.bild), json: abs(`${VP}api/news/${n.id}.json`) });
  const tree = (id) => ({ ...unitOut(E[id]), children: children(id).map((c) => tree(c.id)) });
  const meta = { quelle: abs(url.page("")), variante: VID, land: behoerde.land, sprache: LOCALE, stand: BUILD_DATE, hinweis: behoerde.hinweis };
  const varianten = VARIANT_META.map((m) => ({ variante: m.id, land: m.land, name: m.name, kurzname: m.kurzname, website: abs(m.pfad + "index.html"), api: abs(m.pfad + "api/index.json") }));

  writeJson(`${VP}api/behoerde.json`, { ...meta, behoerde: { ...behoerde, logoUrls: Object.fromEntries(Object.entries(behoerde.logo).map(([kk, v]) => [kk, abs(v)])), leitung: personOut(leitung), hauptsitz: hs } });
  writeJson(`${VP}api/organisation.json`, { ...meta, standDerOrganisation: org.stand, begriffe: { leitung: B.leitung, stab: B.stab, abteilung: B.abteilung, referat: B.referat }, anzahl: einheiten.length, einheiten: einheiten.map(unitOut), baum: tree("leitung") });
  writeJson(`${VP}api/personen.json`, { ...meta, anzahl: personen.length, personen: personen.map(personOut) });
  writeJson(`${VP}api/aufgaben.json`, { ...meta, anzahl: aufgaben.length, aufgaben: aufgaben.map((a) => ({ ...a, url: abs(url.page("aufgaben.html#" + a.id)), einheiten: a.einheitIds.map((x) => ({ id: x, name: unitTitle(E[x]) })) })) });
  writeJson(`${VP}api/news.json`, { ...meta, anzahl: news.length, news: news.map(newsOut) });
  writeJson(`${VP}api/standorte.json`, { ...meta, standorte: standorte.map((s) => ({ ...s, bildUrl: abs(s.bild) })) });
  writeJson(`${VP}api/downloads.json`, { ...meta, downloads: downloads.map((d) => ({ ...d, url: abs(d.datei) })) });
  personen.forEach((p) => writeJson(`${VP}api/personen/${p.id}.json`, { ...meta, person: personOut(p), einheit: unitOut(E[p.einheitId]), news: personNews(p.id).map((n) => ({ id: n.id, titel: n.titel, datum: n.datum, url: abs(url.news(n.id)) })) }));
  einheiten.forEach((u) => writeJson(`${VP}api/einheiten/${u.id}.json`, { ...meta, einheit: unitOut(u), parent: u.parentId ? unitOut(E[u.parentId]) : null, children: children(u.id).map(unitOut), personen: unitPersons(u.id).map(personOut), aufgaben: unitTasks(u.id), standort: S[u.standortId], news: unitNews(u.id).map((n) => ({ id: n.id, titel: n.titel, datum: n.datum, url: abs(url.news(n.id)) })) }));
  news.forEach((n) => writeJson(`${VP}api/news/${n.id}.json`, { ...meta, news: newsOut(n), einheit: unitOut(E[n.einheitId]), personen: n.personIds.map((x) => personOut(P[x])) }));
  writeJson(`${VP}api/alles.json`, { ...meta, behoerde, standorte, einheiten: einheiten.map(unitOut), personen: personen.map(personOut), aufgaben, news: news.map(newsOut), downloads });
  writeJson(`${VP}api/suche.json`, { eintraege: [
    ...personen.map((p) => ({ typ: "Person", titel: fullName(p), text: `${p.funktion} – ${unitTitle(E[p.einheitId])}. ${p.kurzvita}`, url: local(url.person(p.id)) })),
    ...einheiten.map((u) => ({ typ: typLabel[u.typ], titel: unitTitle(u), text: u.beschreibung || `Leitung: ${u.leitungPersonId ? fullName(P[u.leitungPersonId]) : "–"}`, url: local(url.einheit(u.id)) })),
    ...aufgaben.map((a) => ({ typ: "Aufgabe", titel: a.titel, text: [a.beschreibung, ...(a.details || []), ...(a.beispiele || [])].join(" "), url: "aufgaben.html#" + a.id })),
    ...(SZ ? [{ typ: "Seite", titel: SZ.titel, text: [SZ.kurzfassung, ...SZ.einleitung, ...SZ.zustaendig].join(" "), url: "auftrag.html" }] : []),
    ...news.map((n) => ({ typ: n.kategorie, titel: n.titel, text: n.teaser + " " + plain(n.text), url: local(url.news(n.id)) })),
  ] });
  const endpoints = [
    ["api/behoerde.json", "Stammdaten der Behörde: Name, Auftrag, Leitbild, Kennzahlen, Kontakt, Logos, Geschichte"],
    ["api/organisation.json", "Aufbauorganisation: alle Einheiten (flach) und als Baum (baum)"],
    ["api/personen.json", "Alle Personen mit Funktion, Einheit, Kontakt und Porträt-URL"],
    ["api/aufgaben.json", "Aufgaben und Leistungen mit zuständigen Einheiten, Details und Beispielen"],
    ["api/news.json", "Meldungen und Mitteilungen, neueste zuerst"],
    ["api/standorte.json", "Standorte mit Adressen"],
    ["api/downloads.json", "Formulare und Publikationen"],
    ["api/alles.json", "Gesamtexport aller Inhalte in einer Datei"],
    ["api/personen/{id}.json", "Einzelne Person inkl. Einheit und Erwähnungen"],
    ["api/einheiten/{id}.json", `Einzelne Organisationseinheit inkl. Leitung, Personen, Unter-Einheiten, Aufgaben`],
    ["api/news/{id}.json", "Einzelne Meldung inkl. beteiligter Personen"],
  ];
  writeJson(`${VP}api/index.json`, { ...meta, name: behoerde.name, kurzname: behoerde.kurzname, beschreibung: `Maschinenlesbare Schnittstelle der (fiktiven) Behörde, Länderversion ${behoerde.land}. Alle Inhalte der Website sind hier als JSON abrufbar. IDs sind stabil und dateiübergreifend referenzierbar.`, logo: abs(behoerde.logo.png), begriffe: { leitung: B.leitung, stab: B.stab, abteilung: B.abteilung, referat: B.referat, hinweis: `Die internen Typen 'abteilung' und 'referat' heißen in dieser Länderversion '${B.abteilung}' und '${B.referat}'.` }, varianten, endpunkte: endpoints.map(([p, d]) => ({ pfad: p, url: abs(VP + p), beschreibung: d })), ids: { personen: personen.map((p) => p.id), einheiten: einheiten.map((u) => u.id), news: news.map((n) => n.id) }, jsonLd: "Jede HTML-Seite enthält zusätzlich schema.org-JSON-LD (GovernmentOrganization, Person, NewsArticle)." });

  page({
    rel: url.page("daten.html"), title: "Offene Daten und Schnittstelle", description: `Alle Inhalte des ${behoerde.kurzname} als maschinenlesbare JSON-Dateien.`, crumbs: [["Offene Daten & API", url.page("daten.html")]],
    body: `<section class="section"><div class="container article"><div class="eyebrow">Offene Daten</div><h1>Schnittstelle (JSON)</h1><p class="lead">Alle Inhalte dieser Website stehen als JSON zur Verfügung, etwa für KI-Assistenten, MCP-Server oder Fachverfahren. Einstiegspunkt ist <a href="@/${VP}api/index.json"><code>api/index.json</code></a>; eine Kurzbeschreibung für Sprachmodelle liegt unter <a href="@/${VP}llms.txt"><code>llms.txt</code></a>.</p>
<div class="table-wrap"><table><thead><tr><th>Endpunkt</th><th>Inhalt</th></tr></thead><tbody>${endpoints.map(([p, d]) => `<tr><td>${p.includes("{") ? `<code>${p}</code>` : `<a href="@/${VP}${p}"><code>${p}</code></a>`}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table></div>
<h2 style="margin-top:32px">Länderversionen</h2><div class="table-wrap"><table><thead><tr><th>Land</th><th>Behörde</th><th>API</th></tr></thead><tbody>${VARIANT_META.map((m) => `<tr><td>${esc(m.land)}</td><td><a href="@/${m.pfad}index.html">${esc(m.name)} (${esc(m.kurzname)})</a></td><td><a href="@/${m.pfad}api/index.json"><code>${m.pfad}api/index.json</code></a></td></tr>`).join("")}</tbody></table></div>
<h2 style="margin-top:32px">IDs</h2><p>Personen: <code>p-nachname-vorname</code>, Einheiten: <code>leitung</code>, <code>stab-*</code>, <code>abt-*</code>, <code>ref-*</code> (in dieser Version: ${esc(B.abteilung)} = <code>abt-*</code>, ${esc(B.referat)} = <code>ref-*</code>), Meldungen: <code>JJJJ-MM-stichwort</code>. Jede HTML-Seite verweist per <code>&lt;link rel="alternate" type="application/json"&gt;</code> auf ihr JSON-Gegenstück.</p></div></section>`,
  });

  // Auftrag-Seite (öffentlich, bewusst ohne Prozessmodell)
  if (SZ) {
    page({
      rel: url.page("auftrag.html"), active: "auftrag.html", title: SZ.titel, description: SZ.kurzfassung, crumbs: [["Auftrag", url.page("auftrag.html")]], jsonld: [ldOrganisation()], alternate: "api/behoerde.json",
      body: `<div class="container page-head"><div class="eyebrow">Unser Auftrag</div><h1>${esc(SZ.titel)}</h1><p class="lead">${esc(SZ.kurzfassung)}</p></div>
<section class="section" style="padding-top:8px"><div class="container layout-aside"><div class="prose">
${SZ.einleitung.map(para).join("\n")}
<h2>Wofür wir zuständig sind</h2><ul class="checklist">${SZ.zustaendig.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h2>Wofür wir nicht zuständig sind</h2><ul class="crosslist">${SZ.nichtZustaendig.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
</div><aside><div class="aside-box"><h2>Auf einen Blick</h2><dl class="facts facts-compact"><div><dt>Rechtsgrundlage</dt><dd>${esc(behoerde.rechtsgrundlage.titel)}</dd></div><div><dt>Leitung</dt><dd><a href="@/${url.person(leitung.id)}">${esc(fullName(leitung))}</a></dd></div><div><dt>Hauptsitz</dt><dd>${esc(hs.ort)}</dd></div></dl></div>
<div class="aside-box"><h2>Weiterführend</h2><ul class="list-plain"><li><a href="@/${VP}aufgaben.html">Aufgaben und Leistungen</a></li><li><a href="@/${VP}service.html">Formulare und Downloads</a></li><li><a href="@/${VP}organisation.html">Organigramm</a></li><li><a href="@/${VP}aktuelles.html">Aktuelles</a></li></ul></div></aside></div></section>`,
    });
  }

  // Musterlösung: nur lokal nach referenz/<variante>/musterloesung.md (nicht im Git, nicht veröffentlicht)
  if (REF) {
    const q = (t) => (VID === "ch" ? `«${t}»` : `„${t}“`);
    const ref = `# Musterlösung: ${behoerde.name} (${behoerde.kurzname})

Nur für die Auswertung. Diese Datei wird nicht veröffentlicht.
Land: ${behoerde.land} · Sprache: ${LOCALE} · Gegründet: ${behoerde.gruendung.slice(0, 4)} · Hauptsitz: ${standortAddr(hs)}
Leitung: ${fullName(leitung)} (${leitung.funktion}) · Rechtsgrundlage: ${behoerde.rechtsgrundlage.titel}
Motto: ${q(behoerde.claim)}

## Kurzfassung
${REF.kurzfassung}

## Auftrag
${behoerde.auftrag}

${REF.einleitung.join("\n\n")}

## Zuständig
${REF.zustaendig.map((x) => `- ${x}`).join("\n")}

## Nicht zuständig
${REF.nichtZustaendig.map((x) => `- ${x}`).join("\n")}

## Aufbauorganisation (${B.leitung} → ${B.abteilungPlural} → ${B.referatPlural})
- ${B.leitung}: ${fullName(leitung)}; ${B.stabPlural}: ${stabs.map((u) => `${u.name} (${fullName(P[u.leitungPersonId])})`).join(", ")}
${abteilungen.map((a) => `- ${B.abteilung} ${a.kuerzel} ${a.name} (Leitung ${fullName(P[a.leitungPersonId])}): ${children(a.id).map((c) => `${c.kuerzel} ${c.name}`).join("; ")}`).join("\n")}

## Vorgangsarten
${REF.vorgangsarten.map((v) => `### ${v.titel} [${v.id}]\n${v.beschreibung}\n- Auslöser: ${v.ausloeser}\n- Ergebnis: ${v.ergebnis}\n- Frist: ${v.frist}\n- Zuständig: ${unitTitle(E[v.einheitId])} (${v.einheitId})`).join("\n\n")}

## Typischer Verfahrensablauf
${REF.ablauf.map((x, i) => `${i + 1}. ${x.schritt}: ${x.text}`).join("\n")}

## Beteiligte
${REF.beteiligte.map((x) => `- ${x.rolle}: ${x.text}`).join("\n")}

## Beispielfälle
${REF.beispielfaelle.map((f) => `### ${f.titel} (Az. ${f.aktenzeichen})\n${f.text}\nZuständig: ${unitTitle(E[f.einheitId])}`).join("\n\n")}

## Aufgaben und Leistungen
${aufgaben.map((a) => `- ${a.titel} (${a.kategorie}, ${a.rechtsgrundlage}): ${a.beschreibung}`).join("\n")}

## Tonalität
${REF.tonalitaet}
`;
    fs.writeFileSync(path.join(ROOT, "referenz", VID, "musterloesung.md"), swiss(ref));
  }

  // llms.txt
  const llms = `# ${behoerde.name} (${behoerde.kurzname}) – Länderversion ${behoerde.land}

> ${behoerde.hinweis}
> ${behoerde.auftrag}
${SZ ? `\n## Auftrag\n${SZ.kurzfassung}\nMehr: ${abs(VP + "auftrag.html")}\n` : ""}
Leitung: ${fullName(leitung)} (${leitung.funktion}). Hauptsitz: ${standortAddr(hs)}. Kontakt: ${k.telefon}, ${k.email}.
Begriffe in dieser Version: ${B.abteilung} (abt-*), ${B.referat} (ref-*), ${B.stab} (stab-*).

## Maschinenlesbare Daten
${endpoints.filter(([p]) => !p.includes("{")).map(([p, d]) => `- [${p}](${abs(VP + p)}): ${d}`).join("\n")}
- Einzelobjekte: ${abs(VP + "api/personen/{id}.json")}, ${abs(VP + "api/einheiten/{id}.json")}, ${abs(VP + "api/news/{id}.json")}

## Organisation
${einheiten.filter((u) => u.typ !== "referat").map((u) => `- [${unitTitle(u)}](${abs(url.einheit(u.id))}): Leitung ${fullName(P[u.leitungPersonId])}${children(u.id).filter((c) => c.typ === "referat").length ? `; ${B.referatPlural}: ` + children(u.id).filter((c) => c.typ === "referat").map((c) => `${c.kuerzel} ${c.name}`).join(", ") : ""}`).join("\n")}

## Seiten
${NAV.map(([h, l]) => `- [${l}](${abs(VP + h)})`).join("\n")}
- [Offene Daten](${abs(VP + "daten.html")})

## Länderversionen
${VARIANT_META.map((m) => `- ${m.land}: [${m.name} (${m.kurzname})](${abs(m.pfad + "index.html")}) – [llms.txt](${abs(m.pfad + "llms.txt")}) – [API](${abs(m.pfad + "api/index.json")})`).join("\n")}
`;
  fs.writeFileSync(path.join(ROOT, `${VP}llms.txt`), swiss(llms)); written.push(`${VP}llms.txt`);

  // ---------- Downloads (Platzhalter-PDFs, Organigramm-SVG) ----------
  const winAnsi = { "€": 0x80, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97, "•": 0x95 };
  const pdfStr = (s) => { const bytes = []; for (const ch of swiss(s).replace(/☐/g, "[ ]").replace(/→/g, "->")) { let c = winAnsi[ch] ?? ch.normalize("NFD")[0].codePointAt(0); if (ch.codePointAt(0) <= 255) c = winAnsi[ch] ?? ch.codePointAt(0); if (c > 255) c = 0x3f; if (c === 0x28 || c === 0x29 || c === 0x5c) bytes.push(0x5c); bytes.push(c); } return Buffer.from(bytes).toString("latin1"); };
  const wrap = (text, n) => { const out = []; let line = ""; for (const w of text.split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out; };
  function makePdf(file, title, blocks) {
    const lines = [];
    for (const bl of blocks) { if (bl.h) lines.push({ t: bl.h, s: 13, b: true, gap: 10 }); else for (const l of wrap(bl, 92)) lines.push({ t: l, s: 10.5 }); lines.push({ t: "", s: 6 }); }
    let y = 735; const ops = [`0.2 0.2 0.2 rg 50 780 495 3 re f`, `BT /F2 18 Tf 50 752 Td (${pdfStr(title)}) Tj ET`, `BT /F1 9 Tf 0.4 0.4 0.4 rg 50 795 Td (${pdfStr(behoerde.name + " – fiktiver Demonstrationsinhalt")}) Tj ET`, "0 0 0 rg"];
    for (const l of lines) { y -= (l.gap || 0) + l.s * 1.45; if (y < 60) break; if (l.t) ops.push(`BT /${l.b ? "F2" : "F1"} ${l.s} Tf 50 ${y.toFixed(1)} Td (${pdfStr(l.t)}) Tj ET`); }
    const content = Buffer.from(ops.join("\n"), "latin1");
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", null];
    let pdf = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"); const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); const body = o === null ? Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]) : Buffer.from(o, "latin1"); pdf = Buffer.concat([pdf, Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]); });
    const xref = pdf.length;
    pdf = Buffer.concat([pdf, Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (${pdfStr(title)}) /Author (${pdfStr(behoerde.name)}) >> >>\nstartxref\n${xref}\n%%EOF\n`, "latin1")]);
    const f = path.join(ROOT, file); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, pdf); written.push(file);
  }
  for (const d of downloads) {
    if (d.art === "jahresbericht") makePdf(d.datei, d.titel, [`Vorwort: ${behoerde.grusswort.titel}`, `„${behoerde.jahresberichtZitat}“ – ${fullName(leitung)}, ${leitung.funktion}`, { h: "Kennzahlen" }, ...behoerde.kennzahlen.map((x) => `• ${x.label}: ${x.wert}`), { h: "Organisation" }, ...abteilungen.map((a) => `• ${unitTitle(a)} – Leitung: ${fullName(P[a.leitungPersonId])}`), { h: "Wichtige Ereignisse" }, ...news.map((n) => `• ${fmtDate(n.datum)}: ${n.titel}`)]);
    else if (d.art === "leitfaden") makePdf(d.datei, d.titel, [`Herausgegeben vom ${behoerde.name}. Der Kriterienkatalog umfasst ${behoerde.leitfadenKriterien.length} Kriterien; eine Angelegenheit gilt als besonders, wenn mindestens drei Kriterien erfüllt sind.`, { h: "Kriterien" }, ...behoerde.leitfadenKriterien.map((x, i) => `${i + 1}. ${x}`)]);
    else if (d.art === "formular") makePdf(d.datei, d.titel, [`Bitte vollständig ausfüllen und an ${k.email} senden.`, ...d.felder.flatMap((f) => [{ h: f }, "______________________________________________________________________________"]), "Ort, Datum, Unterschrift: _____________________________________________"]);
  }

  // Organigramm als SVG
  {
    const W = 1500, colW = 280, gap = 18, x0 = (W - (5 * colW + 4 * gap)) / 2;
    const t = (s) => esc(s);
    const c = { dark: behoerde.farben[Object.keys(behoerde.farben)[0]], accent: behoerde.farben[Object.keys(behoerde.farben)[1]] };
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 860" font-family="Source Sans 3, Arial, sans-serif"><title>Organigramm ${t(behoerde.name)} (Stand ${org.stand})</title><rect width="${W}" height="860" fill="#fff"/>`;
    svg += `<text x="40" y="50" font-size="26" font-weight="700" fill="#1F2A30">${t(behoerde.name)} – Organigramm</text><text x="40" y="76" font-size="14" fill="#5B6970">Stand ${fmtDate(org.stand)} · fiktive Behörde · ${t(behoerde.land)}</text>`;
    svg += `<rect x="${W / 2 - 230}" y="100" width="460" height="70" rx="6" fill="${c.dark}"/><text x="${W / 2}" y="128" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">${t(fullName(leitung))} – ${t(leitung.funktion)}</text><text x="${W / 2}" y="152" font-size="14" fill="#fff" opacity=".8" text-anchor="middle">Vertretung: ${t(fullName(vertretung))}</text>`;
    stabs.forEach((s, i) => { const x = W / 2 + 260, y = 92 + i * 30; svg += `<rect x="${x}" y="${y}" width="330" height="25" rx="4" fill="#fff" stroke="${c.accent}" stroke-dasharray="4 3"/><text x="${x + 10}" y="${y + 17}" font-size="13" fill="#1F2A30"><tspan font-weight="700">${t(s.kuerzel)}</tspan>  ${t(s.name)}</text>`; });
    svg += `<path d="M${W / 2} 170V205M${x0 + colW / 2} 205H${x0 + 4 * (colW + gap) + colW / 2}" stroke="${c.dark}" stroke-width="2" fill="none"/>`;
    abteilungen.forEach((a, i) => {
      const x = x0 + i * (colW + gap);
      const nmA = wrap(a.name, 30);
      svg += `<path d="M${x + colW / 2} 205V225" stroke="${c.dark}" stroke-width="2"/><rect x="${x}" y="225" width="${colW}" height="76" rx="6" fill="#F4F4F2" stroke="${c.dark}" stroke-width="2"/><text x="${x + 12}" y="248" font-size="13" font-weight="700" fill="${c.dark}">${t(B.abteilung)} ${t(a.kuerzel)}</text><text x="${x + 12}" y="269" font-size="15" font-weight="700" fill="#1F2A30">${t(nmA[0])}${nmA[1] ? " …" : ""}</text><text x="${x + 12}" y="291" font-size="13" fill="#5B6970">${t(fullName(P[a.leitungPersonId]))}</text>`;
      children(a.id).forEach((r, j) => { const y = 318 + j * 76; const nm = wrap(r.name, 32); svg += `<rect x="${x + 14}" y="${y}" width="${colW - 14}" height="64" rx="5" fill="#fff" stroke="#D8DFE2"/><path d="M${x + 6} ${y - 17}V${y + 32}H${x + 14}" stroke="#D8DFE2" fill="none"/><text x="${x + 24}" y="${y + 20}" font-size="13" fill="#1F2A30"><tspan font-weight="700" fill="${c.dark}">${t(r.kuerzel)}</tspan>  ${t(nm[0])}</text>${nm[1] ? `<text x="${x + 24}" y="${y + 36}" font-size="13" fill="#1F2A30">${t(nm.slice(1).join(" "))}</text>` : ""}<text x="${x + 24}" y="${y + 54}" font-size="12" fill="#5B6970">${t(fullName(P[r.leitungPersonId]))}</text>`; });
    });
    svg += `</svg>\n`;
    const f = path.join(ROOT, dl.organigramm.datei); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, swiss(svg)); written.push(dl.organigramm.datei);
  }
}

function finish() {
  // ---------- Wurzel: Länderauswahl, Weiterleitungen alter DE-URLs, Übersichten ----------
  const sel = VARIANTS.map((v) => v.behoerde);
  const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">`;
  const selHtml = `<!doctype html>
<html lang="de" data-variant="auswahl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bundesamt für besondere Angelegenheiten – Länderauswahl</title>
<meta name="description" content="Fiktive Behördenwebsite in drei Länderversionen: ${sel.map((b) => b.land).join(", ")}.">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${abs("")}">
${sel.map((b) => `<link rel="alternate" hreflang="${b.locale}" href="${abs(b.pfad + "index.html")}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${abs("")}">
<link rel="alternate" type="application/json" href="api/varianten.json" title="Länderversionen als JSON">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
${fonts}
<link rel="stylesheet" href="assets/css/style.css">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "Bundesamt für besondere Angelegenheiten – Länderauswahl", url: abs(""), hasPart: sel.map((b) => ({ "@type": "WebSite", name: b.name, inLanguage: b.locale, url: abs(b.pfad + "index.html") })) }).replace(/</g, "\\u003c")}</script>
</head>
<body class="selector">
<a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
<div class="demo-banner" role="note"><strong>Fiktive Behörde:</strong> Demonstrationsinhalt. Alle Personen, Adressen und Vorgänge sind frei erfunden.</div>
<main id="inhalt" class="selector-main"><div class="container">
<div class="selector-head"><div class="eyebrow">Länderauswahl</div><h1>Bundesamt für besondere Angelegenheiten</h1><p class="lead">Bitte wählen Sie Ihr Land.</p><p class="selector-hint" hidden></p></div>
<nav class="selector-grid" aria-label="Länderversionen">${sel.map((b) => `<a class="selector-card" href="${b.pfad}index.html" lang="${b.locale}" data-variant="${b.variante}"><img class="selector-hero" src="${b.hero.bild}" alt="" width="2400" height="1029"><span class="selector-body"><img class="selector-logo" src="${b.logo.farbig}" alt="" width="56" height="56"><span class="selector-land">${esc(b.land)}</span><strong class="selector-name">${esc(b.name)} (${esc(b.kurzname)})</strong><span class="selector-claim">${esc(b.claim)}</span><span class="selector-url">${esc(abs(b.pfad).replace(/^https?:\/\//, ""))}</span></span></a>`).join("\n")}</nav>
<p class="selector-meta">Maschinenlesbar: <a href="api/varianten.json"><code>api/varianten.json</code></a> · <a href="llms.txt"><code>llms.txt</code></a></p>
</div></main>
<script>
try { var l = (navigator.languages || [navigator.language]).join(" ").toLowerCase(); var m = /de-ch/.test(l) ? "ch" : /de-at/.test(l) ? "at" : /\\bde\\b|de-de/.test(l) ? "de" : "";
  var c = m && document.querySelector('.selector-card[data-variant="' + m + '"]');
  if (c) { c.classList.add("is-suggested"); var h = document.querySelector(".selector-hint"); h.textContent = "Vorschlag nach Ihrer Spracheinstellung: " + c.querySelector(".selector-land").textContent; h.hidden = false; } } catch (e) {}
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, "index.html"), selHtml); written.push("index.html");

  const stubs = [];
  for (const f of written.filter((x) => x.startsWith("de/") && x.endsWith(".html") && x !== "de/index.html")) {
    const old = f.slice(3);
    const target = "../".repeat(old.split("/").length - 1) + f;
    const file = path.join(ROOT, old);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Seite umgezogen</title><meta name="robots" content="noindex">
<link rel="canonical" href="${abs(f)}"><meta http-equiv="refresh" content="0; url=${target}"></head>
<body><p>Die deutsche Länderversion liegt jetzt unter <a href="${target}">${abs(f)}</a>.</p><script>location.replace(${JSON.stringify(target)} + location.hash);</script></body></html>
`);
    stubs.push(old);
  }
  const variantList = sel.map((b) => ({ variante: b.variante, land: b.land, name: b.name, kurzname: b.kurzname, sprache: b.locale, website: abs(b.pfad + "index.html"), api: abs(b.pfad + "api/index.json"), llms: abs(b.pfad + "llms.txt") }));
  fs.mkdirSync(path.join(ROOT, "api"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "api", "index.json"), JSON.stringify({ stand: BUILD_DATE, hinweis: "Fiktive Behörden – Demonstrationsinhalt.", beschreibung: "Länderauswahl. Jede Länderversion hat ihre eigene Website, API und llms.txt.", varianten: variantList }, null, 2) + "\n");
  fs.writeFileSync(path.join(ROOT, "llms.txt"), `# Bundesamt für besondere Angelegenheiten – Länderauswahl

> Fiktive Behörde – Demonstrationsinhalt. Alle Personen, Adressen und Vorgänge sind frei erfunden.
> Die Website gibt es in drei Länderversionen mit jeweils eigener Behörde, eigener API und eigener llms.txt.

## Länderversionen
${sel.map((b) => `- ${b.land}: [${b.name} (${b.kurzname})](${abs(b.pfad + "index.html")}) – [llms.txt](${abs(b.pfad + "llms.txt")}) – [API](${abs(b.pfad + "api/index.json")})`).join("\n")}

Übersicht als JSON: ${abs("api/varianten.json")}
`);
  const htmlPages = written.filter((f) => f.endsWith(".html"));
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${htmlPages.map((f) => `  <url><loc>${abs(f)}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(ROOT, "robots.txt"), `# Fiktive Behörden – Demo. Inhalte dürfen von Werkzeugen (z. B. MCP) abgerufen werden.\nUser-agent: *\nAllow: /\nSitemap: ${abs("sitemap.xml")}\n`);
  fs.writeFileSync(path.join(ROOT, "api", "varianten.json"), JSON.stringify({ stand: BUILD_DATE, hinweis: "Fiktive Behörden – Demonstrationsinhalt.", varianten: VARIANT_META.map((m) => ({ variante: m.id, land: m.land, name: m.name, kurzname: m.kurzname, sprache: m.locale, website: abs(m.pfad + "index.html"), api: abs(m.pfad + "api/index.json"), llms: abs(m.pfad + "llms.txt") })) }, null, 2) + "\n");

  // Linkprüfung über alle Varianten
  const missing = [];
  for (const f of [...htmlPages, ...stubs]) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"#?:]+)(?:[#?][^"]*)?"/g)) {
      if (ref.startsWith("//")) continue;
      if (!fs.existsSync(path.normalize(path.join(ROOT, path.dirname(f), ref)))) missing.push(`${f} → ${ref}`);
    }
  }
  if (missing.length) { console.error(`Fehlende Ziele (${missing.length}):\n  ` + [...new Set(missing)].slice(0, 40).join("\n  ")); process.exit(1); }
  const chLeak = written.filter((f) => f.startsWith("ch/") && /\.(html|json|txt)$/.test(f) && fs.readFileSync(path.join(ROOT, f), "utf8").includes("ß"));
  if (chLeak.length) { console.error("ß in Schweizer Ausgabe: " + chLeak.slice(0, 5).join(", ")); process.exit(1); }
  for (const v of VARIANT_IDS) {
    const pre = VARIANTS.find((x) => x.id === v).behoerde.pfad;
    const mine = written.filter((f) => (pre ? f.startsWith(pre) || f.includes(`/${v}/`) : !/^(ch|at)\//.test(f) && !/\/(ch|at)\//.test(f)));
    console.log(`[${v}] ${mine.filter((f) => f.endsWith(".html")).length} HTML-Seiten, ${mine.filter((f) => f.endsWith(".json")).length} JSON-Dateien`);
  }
  console.log(`OK: ${htmlPages.length} HTML-Seiten gesamt. Referenzen, Links und Schweizer Rechtschreibung geprüft. SITE_URL=${SITE_URL}`);
}
