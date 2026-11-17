# KARINEX Backlink-Tracker

Statische Seite (`index.html`) + eine Vercel-Funktion (`api/marks.js`) zum Speichern der Haken.

## Deploy auf Vercel
1. Ordner in ein GitHub-Repo hochladen (oder `npx vercel` im Ordner ausführen).
2. Auf vercel.com: **Add New → Project →** Repo importieren → **Deploy** (keine Build-Einstellungen nötig).
3. Speichern aktivieren: im Projekt **Storage → Create Database → Upstash (Redis)** → mit dem Projekt verbinden. Vercel setzt die Variablen automatisch.
4. Optional: **Settings → Environment Variables →** `TRACKER_PIN` = eigene PIN (dann kann nur speichern, wer die PIN kennt).
5. **Redeploy**, fertig.

Ohne Datenbank funktioniert die Seite auch, speichert die Haken dann aber nur im jeweiligen Browser.
Sprache: `/#ar` (Arabisch) oder `/#de` (Deutsch).

## Inhalt (Stand 17.11.2026, Daten: Ahrefs)
- **Chancen**: 482 Seiten, die die Wettbewerber verlinken: softwareindustrie24.de, mysoftware.de, softwarebilliger.de, lizenzhub.de.
- **Defekte Links**: 27 Seiten, die auf tote Seiten (404) der Wettbewerber verlinken, mit fertiger E-Mail-Vorlage zum Kopieren.
- **Plan Schritt für Schritt**: Reihenfolge, um die Domain-Stärke (DR) von karinex.de aufzubauen.
- `disavow-karinex.txt`: 388 Spam-Domains, die karinex.de verlinken. In der Google Search Console im Disavow-Tool hochladen.
