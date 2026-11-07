// Build für die Homepage des (fiktiven) Bundesamts für besondere Angelegenheiten.
// Liest data/*.json, prüft alle Querverweise und erzeugt statisches HTML, JSON-LD,
// die maschinenlesbare API unter api/, llms.txt, sitemap.xml und Platzhalter-Downloads.
//
// Aufruf:  node tools/build.mjs            (SITE_URL=https://… node tools/build.mjs für absolute URLs)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = (process.env.SITE_URL || "https://baba.example").replace(/\/$/, "");
const BUILD_DATE = new Date().toISOString().slice(0, 10);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const behoerde = read("behoerde.json");
const { einheiten, stand: orgStand } = read("organisation.json");
const { personen } = read("personen.json");
const { aufgaben } = read("aufgaben.json");
const { news: newsUnsorted } = read("news.json");
const { standorte } = read("standorte.json");
const { downloads } = read("downloads.json");
const news = [...newsUnsorted].sort((a, b) => b.datum.localeCompare(a.datum));

// ---------- Indizes und Validierung ----------
const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const E = byId(einheiten), P = byId(personen), S = byId(standorte), A = byId(aufgaben), N = byId(news);
const errors = [];
const need = (map, id, where) => { if (id != null && !map[id]) errors.push(`${where}: unbekannte ID "${id}"`); };
const dup = (arr, name) => { const seen = new Set(); arr.forEach((x) => { if (seen.has(x.id)) errors.push(`${name}: doppelte ID ${x.id}`); seen.add(x.id); }); };
dup(einheiten, "organisation"); dup(personen, "personen"); dup(aufgaben, "aufgaben"); dup(news, "news"); dup(standorte, "standorte");
need(P, behoerde.leitungPersonId, "behoerde.leitungPersonId"); need(S, behoerde.hauptsitzId, "behoerde.hauptsitzId");
einheiten.forEach((u) => { need(E, u.parentId, `einheit ${u.id}.parentId`); need(P, u.leitungPersonId, `einheit ${u.id}.leitungPersonId`); need(P, u.vertretungPersonId, `einheit ${u.id}.vertretungPersonId`); need(S, u.standortId, `einheit ${u.id}.standortId`); });
personen.forEach((p) => need(E, p.einheitId, `person ${p.id}.einheitId`));
aufgaben.forEach((a) => a.einheitIds.forEach((id) => need(E, id, `aufgabe ${a.id}.einheitIds`)));
news.forEach((n) => { need(E, n.einheitId, `news ${n.id}.einheitId`); n.personIds.forEach((id) => need(P, id, `news ${n.id}.personIds`)); });
standorte.forEach((s) => s.einheitIds.forEach((id) => need(E, id, `standort ${s.id}.einheitIds`)));
downloads.forEach((d) => need(E, d.einheitId, `download ${d.id}.einheitId`));
if (errors.length) { console.error("Validierung fehlgeschlagen:\n  " + errors.join("\n  ")); process.exit(1); }

// ---------- Hilfsfunktionen ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
const fullName = (p) => [p.titel, p.vorname, p.nachname].filter(Boolean).join(" ");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const portrait = (p) => (exists(`assets/img/personen/${p.id}.jpg`) ? `assets/img/personen/${p.id}.jpg` : "assets/img/logo/baba-logo.png");
const children = (id) => einheiten.filter((u) => u.parentId === id);
const unitPersons = (id) => personen.filter((p) => p.einheitId === id);
const typLabel = { leitung: "Amtsleitung", stab: "Stabsstelle", abteilung: "Abteilung", referat: "Referat" };
const unitTitle = (u) => (u.typ === "abteilung" ? `Abteilung ${u.kuerzel}: ${u.name}` : u.typ === "referat" ? `Referat ${u.kuerzel}: ${u.name}` : u.name);
const abteilungOf = (u) => { let x = u; while (x && x.typ === "referat") x = E[x.parentId]; return x; };
const url = { person: (id) => `personen/${id}.html`, einheit: (id) => `organisation/${id}.html`, news: (id) => `aktuelles/${id}.html` };
const abs = (rel) => `${SITE_URL}/${rel}`;
const unitTasks = (id) => aufgaben.filter((a) => a.einheitIds.includes(id));
const unitNews = (id) => news.filter((n) => n.einheitId === id || children(id).some((c) => c.id === n.einheitId));
const personNews = (id) => news.filter((n) => n.personIds.includes(id));
const standortAddr = (s) => `${s.strasse}, ${s.plz} ${s.ort}`;

const icons = {
  doc: '<path d="M6 2h8l4 4v16H6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 11h6M9 15h6" stroke="currentColor" stroke-width="2"/>',
  org: '<rect x="9" y="2" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="16" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="16" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5M5 16v-4h14v4" fill="none" stroke="currentColor" stroke-width="2"/>',
  people: '<circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 4a4 4 0 0 1 0 8M18 15c2.5.6 4 2.6 4 6" fill="none" stroke="currentColor" stroke-width="2"/>',
  phone: '<path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2"/>',
  data: '<ellipse cx="12" cy="5" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const icon = (n) => `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[n]}</svg></span>`;

// ---------- JSON-LD ----------
const orgRef = { "@type": "GovernmentOrganization", "@id": `${SITE_URL}/#organisation`, name: behoerde.name };
const postal = (s) => ({ "@type": "PostalAddress", streetAddress: s.strasse, postalCode: s.plz, addressLocality: s.ort, addressCountry: "DE" });
function ldOrganisation(full = false) {
  const hs = S[behoerde.hauptsitzId];
  const sub = (id) => children(id).map((u) => ({ "@type": "GovernmentOrganization", "@id": abs(url.einheit(u.id)), name: unitTitle(u), url: abs(url.einheit(u.id)), ...(u.leitungPersonId ? { employee: { "@type": "Person", "@id": abs(url.person(u.leitungPersonId)), name: fullName(P[u.leitungPersonId]), jobTitle: P[u.leitungPersonId].funktion } } : {}), ...(full && children(u.id).length ? { subOrganization: sub(u.id) } : {}) }));
  return {
    "@context": "https://schema.org", ...orgRef, alternateName: behoerde.kurzname, url: `${SITE_URL}/`, logo: abs(behoerde.logo.png),
    description: behoerde.auftrag, foundingDate: behoerde.gruendung, telephone: behoerde.kontakt.telefon, email: behoerde.kontakt.email,
    address: postal(hs), location: standorte.map((s) => ({ "@type": "Place", name: s.name, address: postal(s) })),
    disambiguatingDescription: behoerde.hinweis,
    ...(full ? { subOrganization: sub("leitung") } : {}),
  };
}
const ldPerson = (p) => ({ "@context": "https://schema.org", "@type": "Person", "@id": abs(url.person(p.id)), name: fullName(p), givenName: p.vorname, familyName: p.nachname, honorificPrefix: p.titel || undefined, jobTitle: p.funktion, email: p.email, telephone: p.telefon, image: abs(portrait(p)), url: abs(url.person(p.id)), description: p.kurzvita, worksFor: { "@type": "GovernmentOrganization", name: unitTitle(E[p.einheitId]), url: abs(url.einheit(p.einheitId)), parentOrganization: orgRef } });
const ldNews = (n) => ({ "@context": "https://schema.org", "@type": "NewsArticle", "@id": abs(url.news(n.id)), headline: n.titel, description: n.teaser, datePublished: n.datum, image: abs(n.bild), articleSection: n.kategorie, author: orgRef, publisher: orgRef, mentions: n.personIds.map((id) => ({ "@type": "Person", name: fullName(P[id]), url: abs(url.person(id)) })) });
const ldBreadcrumbs = (crumbs) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: abs(c[1]) })) });

// ---------- Layout ----------
const NAV = [["index.html", "Startseite"], ["ueber-uns.html", "Über uns"], ["organisation.html", "Organisation"], ["personen.html", "Personen"], ["aufgaben.html", "Aufgaben"], ["aktuelles.html", "Aktuelles"], ["service.html", "Service"], ["presse.html", "Presse"]];
const written = [];
function page({ rel, title, description, active, crumbs = [], body, jsonld = [], alternate }) {
  const depth = rel.split("/").length - 1;
  const b = "../".repeat(depth);
  const allCrumbs = rel === "index.html" ? [] : [["Startseite", "index.html"], ...crumbs];
  const ld = [...jsonld, ...(allCrumbs.length ? [ldBreadcrumbs(allCrumbs)] : [])];
  const fullTitle = rel === "index.html" ? `${behoerde.name} (${behoerde.kurzname})` : `${title} – ${behoerde.kurzname}`;
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, follow">
<meta name="generator" content="BAbA static build ${BUILD_DATE}">
<meta name="baba:hinweis" content="${esc(behoerde.hinweis)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${abs(behoerde.logo.png)}">
<link rel="canonical" href="${abs(rel)}">
<link rel="icon" href="@/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="@/apple-touch-icon.png">
<link rel="alternate" type="application/json" href="@/api/index.json" title="Maschinenlesbare Schnittstelle">
${alternate ? `<link rel="alternate" type="application/json" href="@/${alternate}" title="Inhalt dieser Seite als JSON">\n` : ""}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="@/assets/css/style.css">
${ld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
<div class="demo-banner" role="note"><strong>Fiktive Behörde:</strong> Diese Website ist ein Demonstrationsinhalt für Actanova. Alle Personen, Adressen und Vorgänge sind frei erfunden.</div>
<div class="topbar"><div class="container"><a href="@/barrierefreiheit.html">Barrierefreiheit</a><a href="@/daten.html">Offene Daten &amp; API</a><a href="@/kontakt.html">Kontakt</a><a href="@/suche.html">Suche</a><span lang="en" aria-label="Englische Fassung (in Vorbereitung)">EN</span></div></div>
<header class="site-header"><div class="container">
<a class="brand" href="@/index.html" aria-label="${esc(behoerde.name)} – zur Startseite"><img src="@/assets/img/logo/baba-logo.svg" alt="" width="64" height="64"><span class="brand-text"><span class="brand-name">Bundesamt für<br>besondere Angelegenheiten</span><span class="brand-short">${esc(behoerde.kurzname)}</span></span></a>
<div class="header-search" role="search"><form action="@/suche.html"><label class="visually-hidden" for="kopfsuche">Suche</label><input id="kopfsuche" name="q" type="search" placeholder="Suchbegriff eingeben"><button type="submit">Suchen</button></form></div>
<button class="nav-toggle" aria-expanded="false" aria-controls="hauptnavigation">☰ Menü</button>
</div></header>
<nav class="main-nav" id="hauptnavigation" aria-label="Hauptnavigation"><div class="container"><ul>
${NAV.map(([href, label]) => `<li><a href="@/${href}"${active === href ? ' aria-current="page"' : ""}>${label}</a></li>`).join("\n")}
</ul></div></nav>
${allCrumbs.length ? `<nav class="breadcrumbs" aria-label="Brotkrumennavigation"><div class="container"><ol>${allCrumbs.map((c, i) => (i === allCrumbs.length - 1 ? `<li aria-current="page">${esc(c[0])}</li>` : `<li><a href="@/${c[1]}">${esc(c[0])}</a></li>`)).join("")}</ol></div></nav>` : ""}
<main id="inhalt">
${body}
</main>
<footer class="site-footer">
<div class="container">
<div class="footer-grid">
<div><div class="footer-brand"><img src="@/assets/img/logo/baba-logo-negativ.svg" alt="" width="44" height="44">${esc(behoerde.name)}</div>
<p>${esc(S[behoerde.hauptsitzId].strasse)}<br>${esc(S[behoerde.hauptsitzId].plz)} ${esc(S[behoerde.hauptsitzId].ort)}<br>Telefon ${esc(behoerde.kontakt.telefon)}<br><a href="mailto:${esc(behoerde.kontakt.email)}">${esc(behoerde.kontakt.email)}</a></p></div>
<div><h2>Das Amt</h2><ul><li><a href="@/ueber-uns.html">Über uns</a></li><li><a href="@/organisation.html">Organigramm</a></li><li><a href="@/personen.html">Ansprechpersonen</a></li><li><a href="@/aufgaben.html">Aufgaben</a></li></ul></div>
<div><h2>Service</h2><ul><li><a href="@/service.html">Formulare &amp; Downloads</a></li><li><a href="@/aktuelles.html">Aktuelles</a></li><li><a href="@/presse.html">Presse</a></li><li><a href="@/kontakt.html">Kontakt</a></li></ul></div>
<div><h2>Rechtliches</h2><ul><li><a href="@/impressum.html">Impressum</a></li><li><a href="@/datenschutz.html">Datenschutz</a></li><li><a href="@/barrierefreiheit.html">Barrierefreiheit</a></li><li><a href="@/daten.html">Offene Daten &amp; API</a></li></ul></div>
</div>
<div class="footer-bottom"><span>© ${new Date().getFullYear()} ${esc(behoerde.name)} (fiktiv)</span><span class="machine-hint">Maschinenlesbar: <a href="@/api/index.json"><code>api/index.json</code></a> · <a href="@/llms.txt"><code>llms.txt</code></a></span></div>
</div>
<div class="footer-fiction">Fiktive Behörde – Demonstrationsinhalt für Actanova. Keine echte Einrichtung des Bundes.</div>
</footer>
<script src="@/assets/js/app.js" defer></script>
</body>
</html>
`;
  const out = html.replace(/(href|src|action|data-base)="@\//g, `$1="${b}`);
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  written.push(rel);
}

// ---------- Bausteine ----------
const personCard = (p) => `<article class="card person-card"><img src="@/${portrait(p)}" alt="Porträt ${esc(fullName(p))}" loading="lazy" width="640" height="800"><div class="card-body"><h3><a href="@/${url.person(p.id)}">${esc(fullName(p))}</a></h3><div class="person-role">${esc(p.funktion)}</div><div class="person-unit">${esc(unitTitle(E[p.einheitId]))}</div></div></article>`;
const newsCard = (n) => `<article class="card"><img src="@/${n.bild}" alt="" loading="lazy" width="1400" height="788"><div class="card-body"><div class="meta"><time datetime="${n.datum}">${fmtDate(n.datum)}</time><span class="tag">${esc(n.kategorie)}</span></div><h3><a href="@/${url.news(n.id)}">${esc(n.titel)}</a></h3><p>${esc(n.teaser)}</p><a class="more" href="@/${url.news(n.id)}" aria-label="Weiterlesen: ${esc(n.titel)}">Weiterlesen</a></div></article>`;
const unitLink = (id) => `<a href="@/${url.einheit(id)}">${esc(unitTitle(E[id]))}</a>`;
const taskCard = (a) => `<article class="card task" id="${a.id}"><div class="card-body"><span class="tag tag-gold">${esc(a.kategorie)}</span><h3 style="margin-top:.5em">${esc(a.titel)}</h3><p>${esc(a.beschreibung)}</p><div class="meta">Rechtsgrundlage: ${esc(a.rechtsgrundlage)}</div><div class="units">${a.einheitIds.map((id) => `<a class="tag" href="@/${url.einheit(id)}">${esc(E[id].typ === "abteilung" ? "Abt. " + E[id].kuerzel : E[id].typ === "referat" ? "Ref. " + E[id].kuerzel : E[id].name)}</a>`).join("")}</div></div></article>`;
const orgBox = (u, cls = "") => { const l = P[u.leitungPersonId]; return `<div class="org-box ${cls}"><a href="@/${url.einheit(u.id)}">${u.typ === "referat" ? `<span class="org-kuerzel">${esc(u.kuerzel)}</span>` : ""}${esc(u.name)}</a>${l ? `<span class="lead-name">${esc(fullName(l))}</span>` : ""}</div>`; };

// ---------- Seiten ----------
const leitung = P[behoerde.leitungPersonId];
const abteilungen = einheiten.filter((u) => u.typ === "abteilung");
const stabs = einheiten.filter((u) => u.typ === "stab");

page({
  rel: "index.html", active: "index.html", title: "Startseite", description: behoerde.claim,
  jsonld: [ldOrganisation(), { "@context": "https://schema.org", "@type": "WebSite", name: behoerde.name, url: `${SITE_URL}/`, potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/suche.html?q={q}`, "query-input": "required name=q" } }],
  alternate: "api/behoerde.json",
  body: `<section class="hero" aria-labelledby="hero-titel"><img src="@/assets/img/hero/hero-gebaeude.jpg" alt="Hauptsitz des Bundesamts für besondere Angelegenheiten in Bonn im Abendlicht" width="2400" height="1029" fetchpriority="high">
<div class="container"><span class="hero-kicker">${esc(behoerde.typ)} · seit ${behoerde.gruendung.slice(0, 4)}</span><h1 id="hero-titel">${esc(behoerde.claim)}</h1><p>${esc(behoerde.auftrag.split(". ")[0])}.</p>
<div class="btn-row"><a class="btn btn-primary" href="@/aufgaben.html">Unsere Aufgaben</a><a class="btn btn-ghost" href="@/service.html">Anträge &amp; Formulare</a></div></div></section>
<section class="quick" aria-label="Schnellzugriff"><div class="container"><div class="quick-grid">
<a href="@/service.html">${icon("doc")}<div><strong>Anträge stellen</strong><span>Feststellung, Ausnahmegenehmigung, Registerauskunft</span></div></a>
<a href="@/organisation.html">${icon("org")}<div><strong>Organisation</strong><span>Organigramm mit ${abteilungen.length} Abteilungen und ${einheiten.filter((u) => u.typ === "referat").length} Referaten</span></div></a>
<a href="@/personen.html">${icon("people")}<div><strong>Ansprechpersonen</strong><span>Leitung und Referatsleitungen</span></div></a>
<a href="@/daten.html">${icon("data")}<div><strong>Offene Daten</strong><span>Alle Inhalte als JSON-Schnittstelle</span></div></a>
</div></div></section>
<section class="section"><div class="container"><div class="section-head"><div><div class="eyebrow">Aktuelles</div><h2>Neuigkeiten aus dem Amt</h2></div><a class="btn btn-outline" href="@/aktuelles.html">Alle Meldungen</a></div>
<div class="grid grid-3">${news.slice(0, 3).map(newsCard).join("")}</div></div></section>
<section class="section section-soft"><div class="container"><div class="section-head"><div><div class="eyebrow">Das BAbA in Zahlen</div><h2>Besonders. Seit ${behoerde.gruendung.slice(0, 4)}.</h2></div></div>
<div class="stats">${behoerde.kennzahlen.map((k) => `<div class="stat"><div class="stat-value">${esc(k.wert)}</div><div class="stat-label">${esc(k.label)}</div></div>`).join("")}</div></div></section>
<section class="section"><div class="container"><div class="section-head"><div><div class="eyebrow">Was wir tun</div><h2>Aufgaben im Überblick</h2></div><a class="btn btn-outline" href="@/aufgaben.html">Alle Aufgaben</a></div>
<div class="grid grid-3">${aufgaben.filter((a) => a.kategorie === "Kernaufgabe").slice(0, 3).map(taskCard).join("")}</div></div></section>
<section class="section section-soft"><div class="container greeting"><img src="@/${portrait(leitung)}" alt="Porträt ${esc(fullName(leitung))}" width="640" height="800" loading="lazy">
<div><div class="eyebrow">Grußwort der ${esc(leitung.funktion)}</div><h2>Willkommen beim BAbA</h2><blockquote><p>„Manche Angelegenheiten passen in kein Raster. Für genau diese Fälle gibt es uns – mit Sorgfalt, mit klaren Verfahren und manchmal auch mit einem Lächeln. Ich lade Sie herzlich ein, unser Amt kennenzulernen.“</p></blockquote>
<p><strong><a href="@/${url.person(leitung.id)}">${esc(fullName(leitung))}</a></strong><br>${esc(leitung.funktion)} des ${esc(behoerde.name)}</p></div></div></section>`,
});

const hs = S[behoerde.hauptsitzId];
page({
  rel: "ueber-uns.html", active: "ueber-uns.html", title: "Über uns", description: behoerde.auftrag, crumbs: [["Über uns", "ueber-uns.html"]], jsonld: [ldOrganisation()], alternate: "api/behoerde.json",
  body: `<section class="hero" style="min-height:0"><img src="@/assets/img/hero/hero-atrium.jpg" alt="Atrium des Hauptsitzes" width="2400" height="1029"><div class="container" style="padding-bottom:64px"><span class="hero-kicker">Über uns</span><h1>${esc(behoerde.name)}</h1><p>${esc(behoerde.typ)} im Geschäftsbereich des ${esc(behoerde.geschaeftsbereich)}</p></div></section>
<section class="section"><div class="container layout-aside"><div>
<h2>Unser Auftrag</h2><p class="lead">${esc(behoerde.auftrag)}</p>
<h2 style="margin-top:1.5em">Rechtsgrundlage</h2><p>Grundlage unserer Arbeit ist das <strong>${esc(behoerde.rechtsgrundlage.titel)}</strong> (${esc(behoerde.rechtsgrundlage.fundstelle)}).</p>
<h2 style="margin-top:1.5em">Leitbild</h2><div class="grid grid-2">${behoerde.leitbild.map((l) => `<div class="card"><div class="card-body"><h3>${esc(l.titel)}</h3><p>${esc(l.text)}</p></div></div>`).join("")}</div>
<h2 style="margin-top:1.5em">Geschichte</h2><ol class="timeline">${behoerde.geschichte.map((g) => `<li><strong>${esc(g.jahr)}</strong>${esc(g.ereignis)}</li>`).join("")}</ol>
</div><aside>
<div class="aside-box"><h2>Auf einen Blick</h2><dl class="facts" style="margin:0"><div><dt>Gründung</dt><dd>${fmtDate(behoerde.gruendung)}</dd></div><div><dt>Leitung</dt><dd><a href="@/${url.person(leitung.id)}">${esc(fullName(leitung))}</a></dd></div><div><dt>Hauptsitz</dt><dd>${esc(hs.ort)}</dd></div>${behoerde.kennzahlen.map((k) => `<div><dt>${esc(k.label)}</dt><dd>${esc(k.wert)}</dd></div>`).join("")}</dl></div>
<div class="aside-box"><h2>Weiterführend</h2><ul class="list-plain"><li><a href="@/organisation.html">Organigramm</a></li><li><a href="@/aufgaben.html">Aufgaben</a></li><li><a href="@/service.html">Jahresbericht</a></li></ul></div>
</aside></div></section>
<section class="section section-soft"><div class="container"><h2>Unsere Standorte</h2><div class="grid grid-3">${standorte.map((s) => `<article class="card" id="${s.id}"><img src="@/${s.bild}" alt="${esc(s.name)}" loading="lazy" width="1400" height="933"><div class="card-body"><span class="tag">${esc(s.typ)}</span><h3 style="margin-top:.5em">${esc(s.name)}</h3><p>${esc(standortAddr(s))}<br>Telefon ${esc(s.telefon)}</p><p>${esc(s.beschreibung)}</p></div></article>`).join("")}</div></div></section>`,
});

// Organisation
page({
  rel: "organisation.html", active: "organisation.html", title: "Organisation und Organigramm", description: `Aufbauorganisation des ${behoerde.name}: Amtsleitung, Stabsstellen, ${abteilungen.length} Abteilungen und ihre Referate.`, crumbs: [["Organisation", "organisation.html"]], jsonld: [ldOrganisation(true)], alternate: "api/organisation.json",
  body: `<div class="container page-head"><div class="eyebrow">Aufbauorganisation</div><h1>Organigramm</h1><p class="lead">Stand: ${fmtDate(orgStand)}. Wählen Sie eine Organisationseinheit, um Leitung, Aufgaben und Ansprechpersonen zu sehen.</p>
<div class="btn-row" style="margin:0 0 8px"><button class="btn btn-outline" type="button" data-org-toggle="open">Alle aufklappen</button><button class="btn btn-outline" type="button" data-org-toggle="close">Alle zuklappen</button><a class="btn btn-outline" href="@/assets/downloads/baba-organigramm.svg" download>Organigramm herunterladen (SVG)</a></div>
<div class="org-legend"><span>■ Amtsleitung</span><span style="color:#6E5428">▭ Stabsstelle (gestrichelt)</span><span>▬ Abteilung mit Referaten</span></div></div>
<section class="container" aria-label="Organigramm">
<div class="org-leitung">${["p-wellbrock-hanna", "p-oberreiter-matthias"].map((id) => `<div class="org-person"><img src="@/${portrait(P[id])}" alt=""><div><a href="@/${url.person(id)}"><strong>${esc(fullName(P[id]))}</strong></a><small>${esc(P[id].funktion)}</small></div></div>`).join("")}</div>
<div class="org-stab">${stabs.map((u) => orgBox(u, "org-box-stab")).join("")}</div>
<div class="org-abteilungen">${abteilungen.map((a) => `<details class="org-abt" open><summary><span class="tag">Abteilung ${esc(a.kuerzel)}</span><strong>${esc(a.name)}</strong><span class="lead-name" style="font-size:.88rem;color:var(--muted)">${esc(fullName(P[a.leitungPersonId]))} · ${esc(S[a.standortId].ort)}</span></summary><div class="refs"><a class="more" href="@/${url.einheit(a.id)}" style="font-size:.9rem">Zur Abteilung</a>${children(a.id).map((r) => orgBox(r)).join("")}</div></details>`).join("")}</div>
</section>
<section class="section"><div class="container"><h2>Alle Organisationseinheiten</h2><div class="table-wrap"><table><thead><tr><th>Kürzel</th><th>Einheit</th><th>Typ</th><th>Leitung</th><th>Standort</th></tr></thead><tbody>
${einheiten.map((u) => `<tr><td>${esc(u.kuerzel)}</td><td>${unitLink(u.id)}</td><td>${typLabel[u.typ]}</td><td>${u.leitungPersonId ? `<a href="@/${url.person(u.leitungPersonId)}">${esc(fullName(P[u.leitungPersonId]))}</a>` : "–"}</td><td>${esc(S[u.standortId].ort)}</td></tr>`).join("\n")}
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
  const crumbs = [["Organisation", "organisation.html"]];
  if (parent && parent.typ === "abteilung") crumbs.push([unitTitle(parent), url.einheit(parent.id)]);
  crumbs.push([unitTitle(u), url.einheit(u.id)]);
  page({
    rel: url.einheit(u.id), active: "organisation.html", title: unitTitle(u), description: `${unitTitle(u)} im ${behoerde.name}${u.beschreibung ? ": " + u.beschreibung : ""}`, crumbs,
    alternate: `api/einheiten/${u.id}.json`,
    jsonld: [{ "@context": "https://schema.org", "@type": "GovernmentOrganization", "@id": abs(url.einheit(u.id)), name: unitTitle(u), alternateName: u.kuerzel, description: u.beschreibung, parentOrganization: parent ? { "@type": "GovernmentOrganization", name: unitTitle(parent), url: abs(url.einheit(parent.id)) } : orgRef, address: postal(st), ...(lead ? { employee: members.map((p) => ({ "@type": "Person", name: fullName(p), jobTitle: p.funktion, url: abs(url.person(p.id)) })) } : {}), ...(kids.length ? { subOrganization: kids.map((k) => ({ "@type": "GovernmentOrganization", name: unitTitle(k), url: abs(url.einheit(k.id)) })) } : {}) }],
    body: `<div class="container page-head"><div class="eyebrow">${typLabel[u.typ]}${u.kuerzel ? " " + esc(u.kuerzel) : ""}</div><h1>${esc(u.name)}</h1>${u.beschreibung ? `<p class="lead">${esc(u.beschreibung)}</p>` : ""}</div>
<section class="section" style="padding-top:16px"><div class="container layout-aside"><div>
<dl class="facts"><div><dt>Organisationseinheit</dt><dd>${esc(unitTitle(u))} (${typLabel[u.typ]})</dd></div>${parent ? `<div><dt>Übergeordnet</dt><dd>${unitLink(parent.id)}</dd></div>` : `<div><dt>Übergeordnet</dt><dd>${esc(behoerde.geschaeftsbereich)}</dd></div>`}
<div><dt>Leitung</dt><dd>${lead ? `<a href="@/${url.person(lead.id)}">${esc(fullName(lead))}</a>, ${esc(lead.funktion)}` : "–"}</dd></div>${u.vertretungPersonId ? `<div><dt>Vertretung</dt><dd><a href="@/${url.person(u.vertretungPersonId)}">${esc(fullName(P[u.vertretungPersonId]))}</a></dd></div>` : ""}
<div><dt>Standort</dt><dd>${esc(st.name)}, ${esc(standortAddr(st))}</dd></div>${lead ? `<div><dt>Kontakt</dt><dd>Telefon ${esc(lead.telefon)}<br><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></dd></div>` : ""}</dl>
${kids.length ? `<h2>Untergeordnete Einheiten</h2><div class="grid grid-2" style="margin-bottom:32px">${kids.map((k) => orgBox(k, k.typ === "stab" ? "org-box-stab" : "")).join("")}</div>` : ""}
${tasks.length ? `<h2>Aufgaben</h2><div class="grid grid-2" style="margin-bottom:32px">${tasks.map(taskCard).join("")}</div>` : ""}
${rel.length ? `<h2>Meldungen</h2><ul class="list-plain">${rel.map((n) => `<li><time datetime="${n.datum}">${fmtDate(n.datum)}</time> – <a href="@/${url.news(n.id)}">${esc(n.titel)}</a></li>`).join("")}</ul>` : ""}
</div><aside>${members.length ? `<div class="aside-box"><h2>Ansprechpersonen</h2><div class="grid">${members.map(personCard).join("")}</div></div>` : ""}</aside></div></section>`,
  });
}

// Personen
const personGroups = [["Amtsleitung", ["leitung"]], ["Stabsstellen", stabs.map((u) => u.id)], ...abteilungen.map((a) => [unitTitle(a), [a.id, ...children(a.id).map((c) => c.id)]])];
page({
  rel: "personen.html", active: "personen.html", title: "Ansprechpersonen", description: `Leitung, Abteilungs- und Referatsleitungen des ${behoerde.name}.`, crumbs: [["Personen", "personen.html"]], alternate: "api/personen.json",
  jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", name: "Ansprechpersonen", itemListElement: personen.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(url.person(p.id)), name: fullName(p) })) }],
  body: `<div class="container page-head"><div class="eyebrow">Personen</div><h1>Ansprechpersonen</h1><p class="lead">Die Leitung des Amtes sowie die Leitungen aller Abteilungen, Referate und Stabsstellen.</p></div>
${personGroups.map(([title, ids]) => `<section class="section" style="padding:24px 0"><div class="container"><h2>${esc(title)}</h2><div class="grid grid-4">${personen.filter((p) => ids.includes(p.einheitId)).map(personCard).join("")}</div></div></section>`).join("")}`,
});

for (const p of personen) {
  const u = E[p.einheitId];
  const abt = abteilungOf(u);
  const st = S[u.standortId];
  const pn = personNews(p.id);
  const leads = einheiten.filter((x) => x.leitungPersonId === p.id);
  page({
    rel: url.person(p.id), active: "personen.html", title: `${fullName(p)} – ${p.funktion}`, description: `${fullName(p)}, ${p.funktion}, ${unitTitle(u)}. ${p.kurzvita}`, crumbs: [["Personen", "personen.html"], [fullName(p), url.person(p.id)]],
    jsonld: [ldPerson(p)], alternate: `api/personen/${p.id}.json`,
    body: `<section class="section"><div class="container person-hero"><img src="@/${portrait(p)}" alt="Porträt ${esc(fullName(p))}" width="640" height="800">
<div><div class="eyebrow">${esc(p.funktion)}</div><h1>${esc(fullName(p))}</h1><p class="lead">${esc(p.kurzvita)}</p>
<dl class="facts"><div><dt>Funktion</dt><dd>${esc(p.funktion)}</dd></div><div><dt>Organisationseinheit</dt><dd>${unitLink(u.id)}</dd></div>${abt && abt.id !== u.id && abt.typ === "abteilung" ? `<div><dt>Abteilung</dt><dd>${unitLink(abt.id)}</dd></div>` : ""}
${leads.length ? `<div><dt>Leitet</dt><dd>${leads.map((x) => unitLink(x.id)).join("<br>")}</dd></div>` : ""}
<div><dt>Telefon</dt><dd><a href="tel:${esc(p.telefon.replace(/[^+\d]/g, ""))}">${esc(p.telefon)}</a></dd></div><div><dt>E-Mail</dt><dd><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd></div>
<div><dt>Dienstort</dt><dd>${esc(st.name)}<br>${esc(standortAddr(st))}</dd></div></dl>
${pn.length ? `<h2>Erwähnt in</h2><ul class="list-plain">${pn.map((n) => `<li><time datetime="${n.datum}">${fmtDate(n.datum)}</time> – <a href="@/${url.news(n.id)}">${esc(n.titel)}</a></li>`).join("")}</ul>` : ""}
</div></div></section>`,
  });
}

// Aufgaben
const kategorien = [...new Set(aufgaben.map((a) => a.kategorie))];
page({
  rel: "aufgaben.html", active: "aufgaben.html", title: "Aufgaben", description: `Aufgaben und Leistungen des ${behoerde.name}.`, crumbs: [["Aufgaben", "aufgaben.html"]], alternate: "api/aufgaben.json",
  jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", name: "Aufgaben des BAbA", itemListElement: aufgaben.map((a, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "GovernmentService", name: a.titel, description: a.beschreibung, provider: orgRef, url: abs("aufgaben.html#" + a.id) } })) }],
  body: `<div class="container page-head"><div class="eyebrow">Was wir tun</div><h1>Aufgaben und Leistungen</h1><p class="lead">${esc(behoerde.auftrag)}</p></div>
${kategorien.map((k) => `<section class="section" style="padding:24px 0"><div class="container"><h2>${esc(k)}</h2><div class="grid grid-3">${aufgaben.filter((a) => a.kategorie === k).map(taskCard).join("")}</div></div></section>`).join("")}`,
});

// Aktuelles
page({
  rel: "aktuelles.html", active: "aktuelles.html", title: "Aktuelles", description: "Pressemitteilungen, Meldungen und Veranstaltungen des BAbA.", crumbs: [["Aktuelles", "aktuelles.html"]], alternate: "api/news.json",
  body: `<div class="container page-head"><div class="eyebrow">Aktuelles</div><h1>Meldungen und Pressemitteilungen</h1></div><section class="section" style="padding-top:16px"><div class="container"><div class="grid grid-3">${news.map(newsCard).join("")}</div></div></section>`,
});
for (const n of news) {
  page({
    rel: url.news(n.id), active: "aktuelles.html", title: n.titel, description: n.teaser, crumbs: [["Aktuelles", "aktuelles.html"], [n.titel, url.news(n.id)]], jsonld: [ldNews(n)], alternate: `api/news/${n.id}.json`,
    body: `<section class="section"><div class="container layout-aside"><article class="article"><div class="meta"><time datetime="${n.datum}">${fmtDate(n.datum)}</time><span class="tag">${esc(n.kategorie)}</span></div><h1>${esc(n.titel)}</h1><p class="lead">${esc(n.teaser)}</p>
<figure class="article-figure"><img src="@/${n.bild}" alt="" width="1400" height="788"><figcaption>Foto: BAbA (KI-generiert, fiktiv)</figcaption></figure>
${n.text.map((t) => `<p>${esc(t)}</p>`).join("\n")}</article>
<aside><div class="aside-box"><h2>Zuständig</h2><p>${unitLink(n.einheitId)}</p></div><div class="aside-box"><h2>Personen in dieser Meldung</h2><ul class="list-plain">${n.personIds.map((id) => `<li><a href="@/${url.person(id)}">${esc(fullName(P[id]))}</a><br><small>${esc(P[id].funktion)}</small></li>`).join("")}</ul></div>
<div class="aside-box"><h2>Pressekontakt</h2><p>${esc(fullName(P["p-imhoff-clara"]))}<br>${esc(P["p-imhoff-clara"].telefon)}<br><a href="mailto:${esc(P["p-imhoff-clara"].email)}">${esc(P["p-imhoff-clara"].email)}</a></p></div></aside></div></section>`,
  });
}

// Service
const dlRow = (d) => `<tr><td><a href="@/${d.datei}" download>${esc(d.titel)}</a></td><td>${esc(d.kategorie)}</td><td>${esc(d.typ)}</td><td>${unitLink(d.einheitId)}</td></tr>`;
page({
  rel: "service.html", active: "service.html", title: "Service, Formulare und Downloads", description: "Anträge, Formulare und Publikationen des BAbA.", crumbs: [["Service", "service.html"]], alternate: "api/downloads.json",
  body: `<div class="container page-head"><div class="eyebrow">Service</div><h1>Anträge, Formulare und Downloads</h1><p class="lead">Die meisten Anträge können Sie formlos oder mit den folgenden Formularen stellen. Die digitale Antragstellung über die E-Akte befindet sich im Aufbau.</p></div>
<section class="section" style="padding-top:16px"><div class="container"><div class="grid grid-3">${aufgaben.filter((a) => a.kategorie.startsWith("Leistung")).map(taskCard).join("")}</div>
<h2 style="margin-top:48px">Downloads</h2><div class="table-wrap"><table><thead><tr><th>Dokument</th><th>Kategorie</th><th>Format</th><th>Zuständig</th></tr></thead><tbody>${downloads.map(dlRow).join("")}</tbody></table></div>
<h2 style="margin-top:48px">Servicezeiten</h2><p>${esc(behoerde.kontakt.servicezeiten)} · Telefon ${esc(behoerde.kontakt.telefon)}</p></div></section>`,
});

// Presse
const sprecherin = P["p-imhoff-clara"];
page({
  rel: "presse.html", active: "presse.html", title: "Presse", description: "Pressekontakt, Pressemitteilungen, Logos und Bildmaterial des BAbA.", crumbs: [["Presse", "presse.html"]],
  body: `<div class="container page-head"><div class="eyebrow">Presse</div><h1>Presse und Medien</h1></div>
<section class="section" style="padding-top:16px"><div class="container layout-aside"><div>
<h2>Pressemitteilungen</h2><ul class="list-plain">${news.filter((n) => n.kategorie === "Pressemitteilung").map((n) => `<li><time datetime="${n.datum}">${fmtDate(n.datum)}</time> – <a href="@/${url.news(n.id)}">${esc(n.titel)}</a></li>`).join("")}</ul>
<h2 style="margin-top:40px">Logo und Bildmarke</h2><p>Die Logos dürfen ausschließlich im Zusammenhang mit Berichterstattung über das (fiktive) BAbA verwendet werden.</p>
<div class="grid grid-3"><div><div class="logo-tile"><img src="@/${behoerde.logo.farbig}" alt="Bildmarke farbig"></div><p><a href="@/${behoerde.logo.farbig}" download>SVG</a> · <a href="@/${behoerde.logo.png}" download>PNG</a></p></div>
<div><div class="logo-tile dark"><img src="@/${behoerde.logo.negativ}" alt="Bildmarke negativ"></div><p><a href="@/${behoerde.logo.negativ}" download>SVG (negativ)</a></p></div>
<div><div class="logo-tile"><img src="@/${behoerde.logo.wortbildmarke}" alt="Wort-Bildmarke"></div><p><a href="@/${behoerde.logo.wortbildmarke}" download>SVG (Wort-Bildmarke)</a></p></div></div>
<h3>Farben</h3><div class="grid grid-4">${Object.entries(behoerde.farben).map(([k, v]) => `<div class="card"><div style="height:70px;background:${v}"></div><div class="card-body"><strong>${esc(k[0].toUpperCase() + k.slice(1))}</strong><code>${v}</code></div></div>`).join("")}</div>
<h2 style="margin-top:40px">Pressebilder</h2><div class="grid grid-3">${[["assets/img/hero/hero-gebaeude.jpg", "Hauptsitz Bonn, Außenansicht"], ["assets/img/hero/hero-atrium.jpg", "Hauptsitz Bonn, Atrium"], ...standorte.map((s) => [s.bild, s.name])].map(([src, t]) => `<figure class="card" style="margin:0"><img src="@/${src}" alt="${esc(t)}" loading="lazy"><figcaption class="card-body"><a href="@/${src}" download>${esc(t)}</a></figcaption></figure>`).join("")}</div>
</div><aside><div class="aside-box"><h2>Pressekontakt</h2><div class="org-person"><img src="@/${portrait(sprecherin)}" alt=""><div><a href="@/${url.person(sprecherin.id)}"><strong>${esc(fullName(sprecherin))}</strong></a><small>${esc(sprecherin.funktion)}</small></div></div><p style="margin-top:12px">Telefon ${esc(sprecherin.telefon)}<br><a href="mailto:${esc(sprecherin.email)}">${esc(sprecherin.email)}</a></p></div></aside></div></section>`,
});

// Kontakt
page({
  rel: "kontakt.html", title: "Kontakt", description: "Kontakt und Anschriften des BAbA.", crumbs: [["Kontakt", "kontakt.html"]], jsonld: [ldOrganisation()], alternate: "api/standorte.json",
  body: `<div class="container page-head"><div class="eyebrow">Kontakt</div><h1>So erreichen Sie uns</h1><p class="lead">Servicezeiten: ${esc(behoerde.kontakt.servicezeiten)}</p></div>
<section class="section" style="padding-top:16px"><div class="container"><div class="grid grid-3"><div class="aside-box"><h2>Zentrale</h2><p>Telefon ${esc(behoerde.kontakt.telefon)}<br>Fax ${esc(behoerde.kontakt.fax)}<br>E-Mail <a href="mailto:${esc(behoerde.kontakt.email)}">${esc(behoerde.kontakt.email)}</a><br>De-Mail ${esc(behoerde.kontakt.deMail)}</p></div>
${standorte.map((s) => `<div class="aside-box"><h2>${esc(s.name)}</h2><p>${esc(behoerde.name)}<br>${esc(s.strasse)}<br>${esc(s.plz)} ${esc(s.ort)}<br>Telefon ${esc(s.telefon)}</p></div>`).join("")}</div>
<h2 style="margin-top:32px">Kontaktformular</h2><p>Dieses Formular ist eine Attrappe und versendet keine Daten.</p>
<form onsubmit="alert('Demo: Es werden keine Daten versendet.');return false" style="max-width:640px;display:grid;gap:12px"><label>Name<br><input style="width:100%;padding:10px" name="name"></label><label>E-Mail<br><input style="width:100%;padding:10px" type="email" name="email"></label><label>Ihr Anliegen<br><textarea style="width:100%;padding:10px" rows="5" name="text"></textarea></label><button class="btn btn-primary" type="submit" style="justify-self:start;border:0">Absenden (Demo)</button></form></div></section>`,
});

const simple = (rel, title, html) => page({ rel, title, description: `${title} – ${behoerde.name} (fiktiv)`, crumbs: [[title, rel]], body: `<section class="section"><div class="container article"><h1>${esc(title)}</h1>${html}</div></section>` });
simple("impressum.html", "Impressum", `<p><strong>Hinweis:</strong> ${esc(behoerde.hinweis)}</p><h2>Herausgeber</h2><p>${esc(behoerde.name)}<br>${esc(hs.strasse)}<br>${esc(hs.plz)} ${esc(hs.ort)}</p><p>Telefon ${esc(behoerde.kontakt.telefon)}<br>E-Mail ${esc(behoerde.kontakt.email)}</p><h2>Vertretungsberechtigt</h2><p>${esc(fullName(leitung))}, ${esc(leitung.funktion)}</p><h2>Verantwortlich für den Inhalt</h2><p>${esc(fullName(sprecherin))}, ${esc(sprecherin.funktion)}</p><h2>Bildnachweis</h2><p>Sämtliche Fotos und Porträts wurden mit KI (Higgsfield) erzeugt und zeigen keine realen Personen oder Gebäude.</p>`);
simple("datenschutz.html", "Datenschutzerklärung", `<p>Diese Demonstrations-Website erhebt keine personenbezogenen Daten, setzt keine Cookies und verwendet keine Analysewerkzeuge. Schriftarten werden von Google Fonts geladen; dabei wird Ihre IP-Adresse an Google übermittelt.</p><h2>Behördliche Datenschutzbeauftragte (fiktiv)</h2><p>${esc(fullName(P["p-krell-sabine"]))}<br>${esc(P["p-krell-sabine"].email)}</p>`);
simple("barrierefreiheit.html", "Erklärung zur Barrierefreiheit", `<p>Das BAbA ist bemüht, seine Website im Einklang mit der BITV 2.0 barrierefrei zugänglich zu machen.</p><h2>Stand der Vereinbarkeit</h2><p>Diese Website ist weitgehend mit den Anforderungen vereinbar. Sie bietet semantisches HTML, Sprunglinks, ausreichende Kontraste, Tastaturbedienbarkeit und Alternativtexte.</p><h2>Nicht barrierefreie Inhalte</h2><p>Die PDF-Downloads sind Platzhalter und nicht vollständig barrierefrei.</p><h2>Feedback</h2><p>${esc(behoerde.kontakt.email)}</p>`);

page({
  rel: "suche.html", title: "Suche", description: "Volltextsuche über Personen, Organisationseinheiten, Aufgaben und Meldungen.", crumbs: [["Suche", "suche.html"]],
  body: `<section class="section"><div class="container"><h1>Suche</h1><form class="search-box" role="search" onsubmit="return false"><label class="visually-hidden" for="suchbegriff">Suchbegriff</label><input id="suchbegriff" type="search" placeholder="z. B. Register, Fristen, Kobold" autofocus><button type="submit">Suchen</button></form><div id="suchergebnisse" data-base="@/" aria-live="polite"></div><noscript><p>Die Suche benötigt JavaScript. Alle Inhalte finden Sie auch über die <a href="@/api/index.json">JSON-Schnittstelle</a>.</p></noscript></div></section>`,
});

// ---------- Maschinenlesbare API ----------
const writeJson = (rel, obj) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj, null, 2) + "\n"); written.push(rel); };
const personOut = (p) => ({ ...p, name: fullName(p), portrait: portrait(p), portraitUrl: abs(portrait(p)), url: abs(url.person(p.id)), einheit: { id: p.einheitId, name: unitTitle(E[p.einheitId]), url: abs(url.einheit(p.einheitId)) }, abteilungId: abteilungOf(E[p.einheitId])?.id, standortId: E[p.einheitId].standortId, leitetEinheitIds: einheiten.filter((u) => u.leitungPersonId === p.id).map((u) => u.id), json: abs(`api/personen/${p.id}.json`) });
const unitOut = (u) => ({ ...u, titel: unitTitle(u), typLabel: typLabel[u.typ], url: abs(url.einheit(u.id)), leitung: u.leitungPersonId ? { id: u.leitungPersonId, name: fullName(P[u.leitungPersonId]), funktion: P[u.leitungPersonId].funktion } : null, childIds: children(u.id).map((c) => c.id), personIds: unitPersons(u.id).map((p) => p.id), aufgabeIds: unitTasks(u.id).map((a) => a.id), json: abs(`api/einheiten/${u.id}.json`) });
const newsOut = (n) => ({ ...n, url: abs(url.news(n.id)), bildUrl: abs(n.bild), json: abs(`api/news/${n.id}.json`) });
const tree = (id) => ({ ...unitOut(E[id]), children: children(id).map((c) => tree(c.id)) });
const meta = { quelle: `${SITE_URL}/`, stand: BUILD_DATE, hinweis: behoerde.hinweis };

writeJson("api/behoerde.json", { ...meta, behoerde: { ...behoerde, logoUrls: Object.fromEntries(Object.entries(behoerde.logo).map(([k, v]) => [k, abs(v)])), leitung: personOut(leitung), hauptsitz: S[behoerde.hauptsitzId] } });
writeJson("api/organisation.json", { ...meta, standDerOrganisation: orgStand, anzahl: einheiten.length, einheiten: einheiten.map(unitOut), baum: tree("leitung") });
writeJson("api/personen.json", { ...meta, anzahl: personen.length, personen: personen.map(personOut) });
writeJson("api/aufgaben.json", { ...meta, anzahl: aufgaben.length, aufgaben: aufgaben.map((a) => ({ ...a, url: abs("aufgaben.html#" + a.id), einheiten: a.einheitIds.map((id) => ({ id, name: unitTitle(E[id]) })) })) });
writeJson("api/news.json", { ...meta, anzahl: news.length, news: news.map(newsOut) });
writeJson("api/standorte.json", { ...meta, standorte: standorte.map((s) => ({ ...s, bildUrl: abs(s.bild) })) });
writeJson("api/downloads.json", { ...meta, downloads: downloads.map((d) => ({ ...d, url: abs(d.datei) })) });
personen.forEach((p) => writeJson(`api/personen/${p.id}.json`, { ...meta, person: personOut(p), einheit: unitOut(E[p.einheitId]), news: personNews(p.id).map((n) => ({ id: n.id, titel: n.titel, datum: n.datum, url: abs(url.news(n.id)) })) }));
einheiten.forEach((u) => writeJson(`api/einheiten/${u.id}.json`, { ...meta, einheit: unitOut(u), parent: u.parentId ? unitOut(E[u.parentId]) : null, children: children(u.id).map(unitOut), personen: unitPersons(u.id).map(personOut), aufgaben: unitTasks(u.id), standort: S[u.standortId], news: unitNews(u.id).map((n) => ({ id: n.id, titel: n.titel, datum: n.datum, url: abs(url.news(n.id)) })) }));
news.forEach((n) => writeJson(`api/news/${n.id}.json`, { ...meta, news: newsOut(n), einheit: unitOut(E[n.einheitId]), personen: n.personIds.map((id) => personOut(P[id])) }));
writeJson("api/alles.json", { ...meta, behoerde, standorte, einheiten: einheiten.map(unitOut), personen: personen.map(personOut), aufgaben, news: news.map(newsOut), downloads });
writeJson("api/suche.json", { eintraege: [
  ...personen.map((p) => ({ typ: "Person", titel: fullName(p), text: `${p.funktion} – ${unitTitle(E[p.einheitId])}. ${p.kurzvita}`, url: url.person(p.id) })),
  ...einheiten.map((u) => ({ typ: typLabel[u.typ], titel: unitTitle(u), text: u.beschreibung || `Leitung: ${u.leitungPersonId ? fullName(P[u.leitungPersonId]) : "–"}`, url: url.einheit(u.id) })),
  ...aufgaben.map((a) => ({ typ: "Aufgabe", titel: a.titel, text: a.beschreibung, url: "aufgaben.html#" + a.id })),
  ...news.map((n) => ({ typ: n.kategorie, titel: n.titel, text: n.teaser + " " + n.text.join(" "), url: url.news(n.id) })),
] });
const endpoints = [
  ["api/behoerde.json", "Stammdaten der Behörde: Name, Auftrag, Leitbild, Kennzahlen, Kontakt, Logos, Geschichte"],
  ["api/organisation.json", "Aufbauorganisation: alle Einheiten (flach) und als Baum (baum)"],
  ["api/personen.json", "Alle Personen mit Funktion, Einheit, Kontakt und Porträt-URL"],
  ["api/aufgaben.json", "Aufgaben und Leistungen mit zuständigen Einheiten"],
  ["api/news.json", "Meldungen und Pressemitteilungen, neueste zuerst"],
  ["api/standorte.json", "Standorte mit Adressen"],
  ["api/downloads.json", "Formulare und Publikationen"],
  ["api/alles.json", "Gesamtexport aller Inhalte in einer Datei"],
  ["api/personen/{id}.json", "Einzelne Person inkl. Einheit und Erwähnungen"],
  ["api/einheiten/{id}.json", "Einzelne Organisationseinheit inkl. Leitung, Personen, Unter-Einheiten, Aufgaben"],
  ["api/news/{id}.json", "Einzelne Meldung inkl. beteiligter Personen"],
];
writeJson("api/index.json", { ...meta, name: behoerde.name, kurzname: behoerde.kurzname, beschreibung: "Maschinenlesbare Schnittstelle der (fiktiven) Behörde. Alle Inhalte der Website sind hier als JSON abrufbar. IDs sind stabil und dateiübergreifend referenzierbar.", logo: abs(behoerde.logo.png), endpunkte: endpoints.map(([p, d]) => ({ pfad: p, url: abs(p), beschreibung: d })), ids: { personen: personen.map((p) => p.id), einheiten: einheiten.map((u) => u.id), news: news.map((n) => n.id) }, jsonLd: "Jede HTML-Seite enthält zusätzlich schema.org-JSON-LD (GovernmentOrganization, Person, NewsArticle)." });

page({
  rel: "daten.html", title: "Offene Daten und Schnittstelle", description: "Alle Inhalte des BAbA als maschinenlesbare JSON-Dateien.", crumbs: [["Offene Daten & API", "daten.html"]],
  body: `<section class="section"><div class="container article"><div class="eyebrow">Offene Daten</div><h1>Schnittstelle (JSON)</h1><p class="lead">Alle Inhalte dieser Website stehen als JSON zur Verfügung, etwa für KI-Assistenten, MCP-Server oder Fachverfahren. Einstiegspunkt ist <a href="@/api/index.json"><code>api/index.json</code></a>; eine Kurzbeschreibung für Sprachmodelle liegt unter <a href="@/llms.txt"><code>llms.txt</code></a>.</p>
<div class="table-wrap"><table><thead><tr><th>Endpunkt</th><th>Inhalt</th></tr></thead><tbody>${endpoints.map(([p, d]) => `<tr><td>${p.includes("{") ? `<code>${p}</code>` : `<a href="@/${p}"><code>${p}</code></a>`}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table></div>
<h2 style="margin-top:32px">IDs</h2><p>Personen: <code>p-nachname-vorname</code>, Einheiten: <code>leitung</code>, <code>stab-*</code>, <code>abt-*</code>, <code>ref-*</code>, Meldungen: <code>JJJJ-MM-stichwort</code>. Jede HTML-Seite verweist per <code>&lt;link rel="alternate" type="application/json"&gt;</code> auf ihr JSON-Gegenstück.</p></div></section>`,
});

// llms.txt
const llms = `# ${behoerde.name} (${behoerde.kurzname})

> ${behoerde.hinweis}
> ${behoerde.auftrag}

Leitung: ${fullName(leitung)} (${leitung.funktion}). Hauptsitz: ${standortAddr(hs)}. Kontakt: ${behoerde.kontakt.telefon}, ${behoerde.kontakt.email}.

## Maschinenlesbare Daten
${endpoints.filter(([p]) => !p.includes("{")).map(([p, d]) => `- [${p}](${abs(p)}): ${d}`).join("\n")}
- Einzelobjekte: ${abs("api/personen/{id}.json")}, ${abs("api/einheiten/{id}.json")}, ${abs("api/news/{id}.json")}

## Organisation
${einheiten.filter((u) => u.typ !== "referat").map((u) => `- [${unitTitle(u)}](${abs(url.einheit(u.id))}): Leitung ${fullName(P[u.leitungPersonId])}${children(u.id).filter((c) => c.typ === "referat").length ? "; Referate: " + children(u.id).filter((c) => c.typ === "referat").map((c) => `${c.kuerzel} ${c.name}`).join(", ") : ""}`).join("\n")}

## Seiten
${NAV.map(([h, l]) => `- [${l}](${abs(h)})`).join("\n")}
- [Offene Daten](${abs("daten.html")})
`;
fs.writeFileSync(path.join(ROOT, "llms.txt"), llms); written.push("llms.txt");

// ---------- Downloads (Platzhalter-PDFs, Organigramm-SVG) ----------
const winAnsi = { "€": 0x80, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97, "•": 0x95 };
const pdfStr = (s) => { const bytes = []; for (const ch of s) { let c = winAnsi[ch] ?? ch.codePointAt(0); if (c > 255) c = 0x3f; if (c === 0x28 || c === 0x29 || c === 0x5c) bytes.push(0x5c); bytes.push(c); } return Buffer.from(bytes).toString("latin1"); };
function wrap(text, n) { const out = []; let line = ""; for (const w of text.split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out; }
function makePdf(file, title, blocks) {
  const lines = [];
  for (const b of blocks) { if (b.h) lines.push({ t: b.h, s: 13, b: true, gap: 10 }); else for (const l of wrap(b, 92)) lines.push({ t: l, s: 10.5 }); lines.push({ t: "", s: 6 }); }
  let y = 735; const ops = [`0.059 0.298 0.361 rg 50 780 495 3 re f`, `BT /F2 18 Tf 50 752 Td (${pdfStr(title)}) Tj ET`, `BT /F1 9 Tf 0.4 0.4 0.4 rg 50 795 Td (${pdfStr(behoerde.name + " – fiktiver Demonstrationsinhalt")}) Tj ET`, "0 0 0 rg"];
  for (const l of lines) { y -= (l.gap || 0) + l.s * 1.45; if (y < 60) break; if (l.t) ops.push(`BT /${l.b ? "F2" : "F1"} ${l.s} Tf 50 ${y.toFixed(1)} Td (${pdfStr(l.t)}) Tj ET`); }
  const content = Buffer.from(ops.join("\n"), "latin1");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", null];
  let pdf = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"); const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); const body = o === null ? Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]) : Buffer.from(o, "latin1"); pdf = Buffer.concat([pdf, Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]); });
  const xref = pdf.length;
  pdf = Buffer.concat([pdf, Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (${pdfStr(title)}) /Author (${pdfStr(behoerde.name)}) >> >>\nstartxref\n${xref}\n%%EOF\n`, "latin1")]);
  const f = path.join(ROOT, file); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, pdf); written.push(file);
}
const formular = (nr, titel, felder) => [`Formular ${nr} – bitte vollständig ausfüllen und an ${behoerde.kontakt.email} senden.`, ...felder.flatMap((f) => [{ h: f }, "______________________________________________________________________________"]), "Ort, Datum, Unterschrift: _____________________________________________"];
const dl = Object.fromEntries(downloads.map((d) => [d.id, d]));
makePdf(dl["dl-jahresbericht-2025"].datei, "Jahresbericht 2025/26", [`Vorwort der ${leitung.funktion}`, "„Die Welt wird nicht gewöhnlicher – und das ist gut so.“ – " + fullName(leitung), { h: "Kennzahlen" }, ...behoerde.kennzahlen.map((k) => `• ${k.label}: ${k.wert}`), { h: "Organisation" }, ...abteilungen.map((a) => `• ${unitTitle(a)} – Leitung: ${fullName(P[a.leitungPersonId])}`), { h: "Wichtige Ereignisse" }, ...news.map((n) => `• ${fmtDate(n.datum)}: ${n.titel}`)]);
makePdf(dl["dl-leitfaden-besonderheit"].datei, "Leitfaden: Wann ist eine Angelegenheit besonders?", ["Herausgegeben von Abteilung 1 – Grundsatz und Sonderfälle. Der Prüfkatalog umfasst 14 Kriterien; eine Angelegenheit gilt als besonders, wenn mindestens drei Kriterien erfüllt sind.", { h: "Prüfkatalog" }, ...["Einmaligkeit des Sachverhalts", "Fehlende Regelungszuständigkeit", "Widersprüchliche Zuständigkeiten mehrerer Stellen", "Kopfschüttel-Kriterium", "Keine Entsprechung in bestehenden Formularen", "Kalendarische Besonderheit (z. B. 29. Februar)", "Zeitumstellung während der Frist", "Mehrfachbetroffenheit", "Grenzüberschreitender Bezug", "Fehlende Präzedenzfälle", "Außergewöhnliches öffentliches Interesse", "Unerwarteter Sachzusammenhang", "Formale Selbstbezüglichkeit (Antrag auf Antrag)", "Nachweislich unwahrscheinliches Ereignis"].map((k, i) => `${i + 1}. ${k}`)]);
makePdf(dl["dl-antrag-feststellung"].datei, "Antrag auf Feststellung der Besonderheit (BA-1)", formular("BA-1", "", ["1. Angaben zur antragstellenden Person oder Stelle", "2. Beschreibung der Angelegenheit", "3. Warum ist die Angelegenheit besonders? (Kriterien laut Leitfaden)", "4. Bisher befasste Stellen"]));
makePdf(dl["dl-antrag-ausnahme"].datei, "Antrag auf Ausnahmegenehmigung (BA-7)", formular("BA-7", "", ["1. Angaben zur antragstellenden Person", "2. Regelung, von der abgewichen werden soll", "3. Begründung der Ausnahme", "4. Gewünschter Geltungszeitraum"]));
makePdf(dl["dl-auskunft-brba"].datei, "Antrag auf Registerauskunft BRbA (BR-22)", formular("BR-22", "", ["1. Anfragende Behörde / Person", "2. Berechtigtes Interesse", "3. Registernummer oder Suchmerkmale", "4. Gewünschte Form der Auskunft"]));

// Organigramm als SVG
{
  const W = 1500, colW = 280, gap = 18, x0 = (W - (5 * colW + 4 * gap)) / 2;
  const t = (s) => esc(s);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 860" font-family="Source Sans 3, Arial, sans-serif"><title>Organigramm ${t(behoerde.name)} (Stand ${orgStand})</title><rect width="${W}" height="860" fill="#fff"/>`;
  svg += `<text x="40" y="50" font-size="26" font-weight="700" fill="#1F2A30">${t(behoerde.name)} – Organigramm</text><text x="40" y="76" font-size="14" fill="#5B6970">Stand ${fmtDate(orgStand)} · fiktive Behörde</text>`;
  svg += `<rect x="${W / 2 - 220}" y="100" width="440" height="70" rx="6" fill="#0F4C5C"/><text x="${W / 2}" y="128" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">${t(fullName(leitung))} – ${t(leitung.funktion)}</text><text x="${W / 2}" y="152" font-size="14" fill="#E3EEF0" text-anchor="middle">Vertretung: ${t(fullName(P["p-oberreiter-matthias"]))}</text>`;
  stabs.forEach((s, i) => { const x = W / 2 + 260, y = 92 + i * 30; svg += `<rect x="${x}" y="${y}" width="330" height="25" rx="4" fill="#F3EBDD" stroke="#B08D57" stroke-dasharray="4 3"/><text x="${x + 10}" y="${y + 17}" font-size="13" fill="#1F2A30"><tspan font-weight="700">${t(s.kuerzel)}</tspan>  ${t(s.name)}</text>`; });
  svg += `<path d="M${W / 2} 170V205M${x0 + colW / 2} 205H${x0 + 4 * (colW + gap) + colW / 2}" stroke="#0F4C5C" stroke-width="2" fill="none"/>`;
  abteilungen.forEach((a, i) => {
    const x = x0 + i * (colW + gap);
    svg += `<path d="M${x + colW / 2} 205V225" stroke="#0F4C5C" stroke-width="2"/><rect x="${x}" y="225" width="${colW}" height="76" rx="6" fill="#E3EEF0" stroke="#0F4C5C" stroke-width="2"/><text x="${x + 12}" y="250" font-size="13" font-weight="700" fill="#0F4C5C">Abteilung ${t(a.kuerzel)}</text><text x="${x + 12}" y="271" font-size="15" font-weight="700" fill="#1F2A30">${t(a.name)}</text><text x="${x + 12}" y="291" font-size="13" fill="#5B6970">${t(fullName(P[a.leitungPersonId]))}</text>`;
    children(a.id).forEach((r, j) => { const y = 318 + j * 76; const nm = wrap(r.name, 34); svg += `<rect x="${x + 14}" y="${y}" width="${colW - 14}" height="64" rx="5" fill="#fff" stroke="#D8DFE2"/><path d="M${x + 6} ${y - 17}V${y + 32}H${x + 14}" stroke="#D8DFE2" fill="none"/><text x="${x + 24}" y="${y + 20}" font-size="13" fill="#1F2A30"><tspan font-weight="700" fill="#0F4C5C">${t(r.kuerzel)}</tspan>  ${t(nm[0])}</text>${nm[1] ? `<text x="${x + 24}" y="${y + 36}" font-size="13" fill="#1F2A30">${t(nm.slice(1).join(" "))}</text>` : ""}<text x="${x + 24}" y="${y + 54}" font-size="12" fill="#5B6970">${t(fullName(P[r.leitungPersonId]))}</text>`; });
  });
  svg += `</svg>\n`;
  fs.mkdirSync(path.join(ROOT, "assets/downloads"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, dl["dl-organigramm"].datei), svg); written.push(dl["dl-organigramm"].datei);
}

// ---------- sitemap, robots ----------
const htmlPages = written.filter((f) => f.endsWith(".html"));
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${htmlPages.map((f) => `  <url><loc>${abs(f)}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join("\n")}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, "robots.txt"), `# Fiktive Behörde – Demo. Inhalte dürfen von Werkzeugen (z. B. MCP) abgerufen werden.\nUser-agent: *\nAllow: /\nSitemap: ${abs("sitemap.xml")}\n`);

// ---------- Linkprüfung ----------
const missing = [];
for (const f of htmlPages) {
  const html = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"#?:]+)(?:[#?][^"]*)?"/g)) {
    if (/^(https?|mailto|tel):/.test(ref) || ref.startsWith("//")) continue;
    const target = path.normalize(path.join(ROOT, path.dirname(f), ref));
    if (!fs.existsSync(target)) missing.push(`${f} → ${ref}`);
  }
}
if (missing.length) { console.error(`Fehlende Ziele (${missing.length}):\n  ` + [...new Set(missing)].slice(0, 40).join("\n  ")); process.exit(1); }
console.log(`OK: ${htmlPages.length} HTML-Seiten, ${written.filter((f) => f.endsWith(".json")).length} JSON-Dateien, ${written.filter((f) => /\.(pdf|svg)$/.test(f)).length} Downloads. Referenzen und interne Links geprüft. SITE_URL=${SITE_URL}`);
