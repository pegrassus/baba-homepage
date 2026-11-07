# Bundesamt für besondere Angelegenheiten (BAbA) – fiktive Behörden-Homepage

Statische Demo-Website als Datenquelle für **Actanova Studio** (Abruf per MCP). Alle Personen, Adressen und Vorgänge sind erfunden; alle Bilder wurden mit Higgsfield erzeugt.

## Inhalte ändern

1. Nur die Dateien in `data/` bearbeiten (oder Claude darum bitten):
   - `behoerde.json`: Stammdaten, Leitbild, Kennzahlen, Geschichte, Logos
   - `organisation.json`: Organisationseinheiten (`leitung`, `stab-*`, `abt-*`, `ref-*`) mit `parentId` und `leitungPersonId`
   - `personen.json`, `aufgaben.json`, `news.json`, `standorte.json`, `downloads.json`
2. Danach neu bauen:
   ```
   node tools/build.mjs
   ```
   Der Build prüft alle ID-Querverweise und internen Links und bricht bei Fehlern ab.
   Für die öffentliche URL: `SITE_URL=https://deine-domain node tools/build.mjs`

Porträts liegen unter `assets/img/personen/<person-id>.jpg`, News-Bilder unter `assets/img/news/<news-id>.jpg`. Fehlt ein Porträt, wird das Logo angezeigt.
Herkunft der Higgsfield-Bilder: `tools/assets-manifest.json` (erneut laden: `python -I tools/fetch-assets.py`).

## Für Actanova / MCP

| Einstieg | Inhalt |
|---|---|
| `api/index.json` | Katalog aller Endpunkte und IDs |
| `api/alles.json` | Gesamtexport |
| `api/organisation.json` | Einheiten flach und als Baum |
| `api/personen.json`, `api/personen/{id}.json` | Personen |
| `api/einheiten/{id}.json` | Einheit mit Leitung, Personen, Aufgaben |
| `api/news.json`, `api/news/{id}.json` | Meldungen |
| `llms.txt` | Kurzbeschreibung für Sprachmodelle |

Jede HTML-Seite enthält schema.org-JSON-LD und verweist per `<link rel="alternate" type="application/json">` auf ihr JSON-Gegenstück.

## Lokal ansehen

```
node tools/serve.mjs
```
→ http://localhost:4317

## Veröffentlichung (GitHub Pages)

Live: https://pegrassus.github.io/baba-homepage/ – GitHub Pages veröffentlicht den Branch `main` (Wurzelordner).

Änderung veröffentlichen:
```
SITE_URL=https://pegrassus.github.io/baba-homepage node tools/build.mjs
git add -A
git commit -m "Inhalt aktualisiert"
git push
```

## Logo

Aktiv: `assets/img/logo/baba-logo.svg` (Raster mit gedrehtem goldenen Feld). Alternativen von Higgsfield: `assets/img/logo/entwurf-*.svg`.
