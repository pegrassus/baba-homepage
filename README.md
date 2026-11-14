# Bundesamt für besondere Angelegenheiten – fiktive Behörden-Homepages (DE · CH · AT)

Statische Demo-Websites einer **fiktiven** Bundesbehörde in drei Länderversionen. Alle Personen, Adressen und Vorgänge sind erfunden; alle Bilder wurden mit Higgsfield erzeugt.

| Variante | Behörde | Live | Daten |
|---|---|---|---|
| 🇩🇪 Deutschland | Bundesamt für besondere Angelegenheiten (**BAbA**) | https://pegrassus.github.io/baba-homepage/de/ | `data/de/` |
| 🇨🇭 Schweiz | Bundesamt für besondere Angelegenheiten (**BBA**) | https://pegrassus.github.io/baba-homepage/ch/ | `data/ch/` |
| 🇦🇹 Österreich | Bundesamt für besondere und sonstige Angelegenheiten (**BBSA**) | https://pegrassus.github.io/baba-homepage/at/ | `data/at/` |

Die Wurzel-URL https://pegrassus.github.io/baba-homepage/ ist eine **Länderauswahl** (mit Vorschlag nach Spracheinstellung des Browsers). Alte Adressen der deutschen Version ohne `/de/` leiten automatisch weiter.

Struktur und Logik sind in allen Varianten gleich (gleiche Einheiten-IDs `leitung`, `stab-*`, `abt-*`, `ref-*`), nur Begriffe, Namen und Geschichten sind landestypisch:

- **DE:** Amtsleitung → Abteilungen → Referate.
- **CH:** Direktion → Abteilungen → Sektionen. Schweizer Rechtschreibung (ss statt ß, «Guillemets», 9'874), Art. statt §, Gesuche, Vernehmlassungen.
- **AT:** Amtsleitung → Sektionen (I–V) → Abteilungen (I/1 …). Amtstitel (HR, ADir, OAR), Mag.a/Dr.in, Jänner, Parteienverkehr.

Die Begriffe stehen je Variante in `behoerde.json` → `begriffe`. Für CH ersetzt der Build zusätzlich jedes „ß“ durch „ss“ und bricht ab, wenn in `data/ch/` ein „ß“ steht.

## Inhalte ändern

1. Nur die Dateien in `data/<variante>/` bearbeiten (oder Claude darum bitten):
   - `behoerde.json`: Stammdaten, Begriffe, Grußwort, Leitbild, Kennzahlen, Geschichte, Logos, Kriterienkatalog
     und `auftragSeite` (Seite `auftrag.html`: Kurzfassung, Einleitung, Zuständigkeiten)
   - `organisation.json`: Organisationseinheiten mit `parentId` und `leitungPersonId`
   - `personen.json` (`titel` vor, `titelNach` nach dem Namen), `aufgaben.json`, `news.json`, `standorte.json`, `downloads.json`
   - `news.json`: `text` ist ein Array von Absätzen; ein Eintrag mit `## ` am Anfang wird Zwischenüberschrift.
   - `aufgaben.json`: `beschreibung` (kurz, für Karten), dazu optional `details`, `beispiele` und `leistung` (`antrag`, `dauer`, `kosten`).
2. Danach neu bauen:
   ```
   node tools/build.mjs
   ```
   Der Build prüft alle ID-Querverweise, Bilder, internen Links und die Schweizer Rechtschreibung und bricht bei Fehlern ab.

Bilder: DE unter `assets/img/…`, CH unter `assets/img/ch/…`, AT unter `assets/img/at/…` (`personen/<person-id>.jpg`, `news/<news-id>.jpg`).
Herkunft der Higgsfield-Bilder: `tools/assets-manifest.json` (erneut laden: `python -I tools/fetch-assets.py`).
Logos CH/AT neu erzeugen: `python -I tools/make-logos.py`.

## Maschinenlesbare Daten

Jede Variante hat dieselbe API unter ihrem Pfad (`de/api/…`, `ch/api/…`, `at/api/…`). Übersicht aller Varianten: `api/varianten.json` bzw. `api/index.json` und `llms.txt` an der Wurzel.

| Einstieg | Inhalt |
|---|---|
| `api/index.json` | Katalog aller Endpunkte, IDs, Begriffe und Varianten |
| `api/alles.json` | Gesamtexport |
| `api/organisation.json` | Einheiten flach und als Baum |
| `api/personen.json`, `api/personen/{id}.json` | Personen |
| `api/einheiten/{id}.json` | Einheit mit Leitung, Personen, Aufgaben |
| `api/news.json`, `api/news/{id}.json` | Meldungen |
| `llms.txt` | Kurzbeschreibung für Sprachmodelle |

Jede HTML-Seite enthält schema.org-JSON-LD, `hreflang`-Verweise auf die anderen Länderversionen und per `<link rel="alternate" type="application/json">` ihr JSON-Gegenstück.

## Lokal ansehen

```
node tools/serve.mjs
```
→ http://localhost:4317 (Länderauswahl; DE: `/de/`, CH: `/ch/`, AT: `/at/`)

## Veröffentlichung (GitHub Pages)

GitHub Pages veröffentlicht den Branch `main` (Wurzelordner).

Änderung veröffentlichen:
```
SITE_URL=https://pegrassus.github.io/baba-homepage node tools/build.mjs
git add -A
git commit -m "Inhalt aktualisiert"
git push
```

## Logos

Jede Länderversion hat eine eigene, amtlich wirkende Marke (bewusst ohne Wappen, Adler oder Kreuz):
- **DE (BAbA):** Wappenschild in Petrol mit Messing-Innenlinie, acht Felder um ein gedrehtes Sonderfeld (`assets/img/logo/`).
- **CH (BBA):** rotes Quadrat, weisse Raute im Kreis aus 26 Punkten, einer je Kanton (`assets/img/ch/logo/`).
- **AT (BBSA):** Rundsiegel in Mokka mit goldener Umschrift, acht Felder um „das Sonstige“ (`assets/img/at/logo/`).

Je Version: Bildmarke (farbig, negativ, einfarbig), Wort-Bildmarke (hell, negativ), animierte Lade-Anzeige (SMIL, 128 px) und PNGs. Alle SVGs haben die Schrift als Pfade, keine externen Verweise und sprechende IDs je Bestandteil zum Animieren. Liste mit Adressen: `<variante>/api/logo.json`, Übersicht auf der Presseseite (`presse.html#logo`).

Neu erzeugen: `python -I tools/make-logos.py` (braucht die Windows-Schriften Bahnschrift, Arial und Georgia, dazu Chrome oder Edge für die PNGs). Danach `node tools/build.mjs`.
