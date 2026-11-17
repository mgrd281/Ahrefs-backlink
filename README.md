# KARINEX Backlink-Tracker

Statische Seite (`index.html` + `data.json`) und Vercel-Funktionen in `api/`:

| Datei | Aufgabe |
|---|---|
| `api/marks.js` | Haken speichern (welcher Shop ist auf welcher Seite eingetragen) |
| `api/draft.js` | **Claude** liest eine Seite, sucht die Kontaktadresse (Seite, Impressum, Kontaktseite) und schreibt die fertige Nachricht |
| `api/auto.js` | Zustand der Automatik + Shop-Angaben für die Nachrichten |
| `api/daily.js` | **Täglicher Lauf** (Vercel Cron, 05:17 UTC): Links prüfen, neue Chancen finden, Nachrichten vorschreiben, nachfassen |
| `api/batch.js` | „Jetzt 10 neue Nachrichten schreiben“ – ohne bis morgen zu warten |
| `api/icon.js` | Logos (Favicons) der Seiten, 30 Tage im Vercel-CDN zwischengespeichert |
| `api/_lib.js` | gemeinsame Bausteine (Redis, Webseiten lesen, Claude, Ahrefs) |

## Einrichten auf Vercel
1. Repo auf vercel.com importieren → **Deploy** (keine Build-Einstellungen nötig).
2. **Storage → Create Database → Upstash (Redis)** → mit dem Projekt verbinden.
3. **Settings → Environment Variables:**

| Variable | Wofür | Pflicht |
|---|---|---|
| `TRACKER_PIN` | eigene PIN; ohne PIN kann jeder mit dem Link Claude-Kosten auslösen | **ja** |
| `ANTHROPIC_API_KEY` | Claude schreibt die Nachrichten (Schlüssel von platform.claude.com) | für Claude |
| `AHREFS_API_KEY` | täglicher Link-Check und neue Chancen (Ahrefs API v3) | für den Check |
| `CRON_SECRET` | beliebiger langer Zufallswert; schützt den täglichen Lauf | **ja** |
| `DAILY_DRAFTS` | Nachrichten pro Tag (Standard 8, max. 25) | nein |
| `CLAUDE_MODEL` | Standard `claude-opus-5-5` | nein |
| `PRIMARY_STORE` | Shop für die täglichen Nachrichten (Standard `karinex.de`) | nein |

4. **Redeploy.** Danach im Tab **„Automatik ⚡“** einmal **„Jetzt prüfen“** klicken und die Shop-Angaben (Absender, Beschreibung, Signatur) ausfüllen.

## Zeit sparen: was die Seite für Sie erledigt
| Früher (von Hand) | Jetzt |
|---|---|
| Seite lesen, Ansprechpartner im Impressum suchen, E-Mail schreiben: 15–20 Minuten | Claude erledigt das; Sie prüfen und senden: etwa 30 Sekunden |
| Überlegen, welche Seite zuerst | **Smarte Priorität ⭐**: Stärke, dofollow, Besucher, wie viele Wettbewerber dort stehen, Aufwand. Plattformen ohne Ansprechpartner und Wettbewerber-Shops werden aussortiert |
| Nachsehen, ob der Link inzwischen steht | Täglicher Ahrefs-Check hakt bestätigte Links automatisch ab |
| Nachfassen nicht vergessen | Nach 7 Tagen schreibt Claude die Nachfass-Mail |
| Firmendaten in jedes Verzeichnis tippen | **Firmen-Steckbrief**: jedes Feld mit einem Klick kopieren, Logo zum Herunterladen |

- **Tab „Heute ⚡“** (Startseite): Aufgaben des Tages, gesparte Zeit, **„Schnellversand“** – eine fertige Nachricht nach der anderen: In Outlook öffnen → senden → „✓ Gesendet → Nächste“.
- **Filter „⚡ Schnell: nur eintragen“**: Verzeichnisse, Bewertungsportale, Gutschein- und Presseportale – kein E-Mail-Kontakt nötig.
- **Filter „Mehrere Wettbewerber“**: Seiten, die 2 oder mehr Wettbewerber verlinken – dort sind die Chancen am größten.

## So läuft es
- **Jeden Morgen** prüft Ahrefs, welche Seiten karinex.de jetzt verlinken. Bestätigte Links bekommen „🔗 Bestätigt“ und werden automatisch abgehakt.
- Neue Links der Wettbewerber der letzten Tage werden als neue Chancen eingetragen („Neu“). Einmal pro Woche kommen defekte Links dazu.
- Claude schreibt für die stärksten offenen Chancen fertige Nachrichten (defekte Links in Artikeln zuerst). Je nach Seite: E-Mail, Text für das Firmenprofil, Forenantwort, Pressemitteilung oder Gutschein-Anfrage. Mit Analyse auf Arabisch.
- Im Tab „Automatik“: **„In Outlook öffnen“** öffnet die fertige E-Mail mit Empfänger und Betreff (Outlook Microsoft 365, Outlook.com oder das Mail-Programm, einstellbar). Senden, dann ✓.
- Nach 7 Tagen ohne Link schreibt Claude eine kurze Nachfass-Mail.
- In jeder Zeile gibt es den Knopf **„✨ Claude“** für eine Nachricht auf Wunsch.

**Bewusst nicht automatisch: das Senden.** Unaufgeforderte Werbe-E-Mails sind in Deutschland verboten (UWG § 7), und automatischer Massenversand bringt die Domain auf Spam-Listen. Der Klick auf „Senden“ bleibt deshalb bei Ihnen.

**Kosten (Schätzung):** pro Claude-Nachricht etwa 3 bis 6 US-Cent, bei 8 pro Tag also etwa 10 bis 15 US-Dollar im Monat. Ahrefs: einige hundert bis etwa 2.000 API-Units pro Tag.

Ohne Datenbank funktioniert die Seite auch, speichert die Haken dann aber nur im jeweiligen Browser. Claude und die Automatik brauchen die Datenbank.
Sprache: `/#ar` (Arabisch) oder `/#de` (Deutsch).

## Daten (Stand 17.11.2026, Ahrefs)
- **Chancen**: 500 Seiten, die die Wettbewerber verlinken: softwareindustrie24.de, mysoftware.de, softwarebilliger.de, lizenzhub.de, best-software.de.
- **Download**: Knopf „⬇ Download“ speichert die aktuelle Liste (mit Filter, Suche und Wettbewerber) als CSV für Excel.
- **Defekte Links**: 35 Seiten, die auf tote Seiten (404) der Wettbewerber verlinken.
- **Plan Schritt für Schritt**: Reihenfolge, um die Domain-Stärke (DR) von karinex.de aufzubauen.
- `disavow-karinex.txt`: 388 Spam-Domains, die karinex.de verlinken. In der Google Search Console im Disavow-Tool hochladen.
