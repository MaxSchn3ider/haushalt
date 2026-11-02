# Haushalt – Einrichtung (ca. 20 Minuten, einmalig)

Die App ist eine **Web-App (PWA)**: Sie liegt als Icon auf dem Home-Bildschirm, startet im Vollbild,
funktioniert offline und braucht **kein Apple-Entwicklerkonto, kein Xcode und läuft nicht nach 7 Tagen ab**.

---

## 1. Gemeinsame Datenbank anlegen (Supabase, kostenlos)

1. Auf **supabase.com** kostenloses Konto anlegen → **New project**
   - Name: `haushalt`, Region: **Frankfurt (eu-central-1)**, Passwort vergeben.
2. Links **SQL Editor** → **New query** → kompletten Inhalt von `supabase_setup.sql` einfügen → **Run**.
   Es muss „Success“ erscheinen.
3. **Project Settings → API / API Keys** öffnen und notieren:
   - **Project URL** (z. B. `https://abcd1234.supabase.co`)
   - **Publishable key** bzw. **anon public key**
   ⚠ Den *secret* / *service_role* Key **nie** verwenden.

## 2. App online stellen (kostenlos, HTTPS)

**Variante A – Netlify (am einfachsten):**
1. Kostenloses Konto auf **netlify.com** anlegen.
2. **Add new site → Deploy manually** → den **ganzen Ordner** `haushalt` hineinziehen.
3. Du bekommst eine Adresse wie `https://dein-name.netlify.app` (unter *Site settings* umbenennbar).

**Variante B – GitHub Pages:** Repository anlegen, alle Dateien hochladen,
*Settings → Pages → Branch: main* → Adresse `https://<name>.github.io/<repo>/`.

Die Adresse enthält **keine Daten** – die liegen nur auf euren iPhones und (geschützt) in Supabase.

## 3. Auf beiden iPhones installieren

1. Adresse in **Safari** öffnen.
2. **Teilen-Symbol → „Zum Home-Bildschirm“** (ggf. „Als Web-App öffnen“ aktiviert lassen) → Hinzufügen.
3. Ab jetzt **nur noch über das Icon** starten (die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari).

## 4. Beide iPhones verbinden

**Dein iPhone:** Mehr → *Mit Partner/in verbinden* → Teil **B** → URL + Key eintragen → *Haushalt anlegen & verbinden*
→ danach *Code kopieren* und deiner Frau schicken (WhatsApp/iMessage).

**iPhone deiner Frau:** Mehr → *Mit Partner/in verbinden* → Teil **A** → Code einfügen → *Verbinden*.

Fertig: Gleiche Daten auf beiden Geräten. Synchronisiert wird beim Öffnen, nach jeder Änderung und alle 30 Sek.
Offline-Einträge werden nachgereicht.

> Der Code ist der Schlüssel zu euren Daten – nur untereinander teilen.

---

## Bedienung

| Was | Wo |
|---|---|
| Bon scannen | **+** → *Kassenbon fotografieren* (Bon flach hinlegen, gutes Licht, ganzer Bon im Bild) |
| Lange Bons | **+** → *Bon aus Fotos wählen* → mehrere Fotos von oben nach unten auswählen |
| Ein Betrag (Tanken, Friseur …) | **+** → *Schnelle Ausgabe* |
| Miete, Versicherungen, Abos | Tab **Fixkosten** (monatlich / vierteljährlich / halbjährlich / jährlich) |
| Falsch sortierten Artikel korrigieren | Übersicht → Gruppe antippen → Untergruppe → Gruppe ändern (**App merkt sich das**) |
| Unsortierte Artikel | Orangener Hinweis in der Übersicht |
| Auswertung für Excel | Mehr → *Als Excel/CSV exportieren* |

**Nach dem Scan immer kurz prüfen:** Die App vergleicht die Summe der Positionen mit der Bon-Summe
und zeigt eine Differenz an. Texterkennung ist bei zerknitterten/verblassten Bons nicht perfekt.

## Ordnungslogik ändern (jederzeit, wird synchronisiert)

- **Mehr → Gruppen bearbeiten:** umbenennen, Farbe, Untergruppe in andere Hauptgruppe verschieben,
  **zusammenführen** (Artikel/Regeln/Fixkosten wandern mit), löschen, neue Gruppen.
- **Mehr → Zuordnungsregeln:** Stichwort → Gruppe. Das genaueste Stichwort gewinnt;
  „ganzes Wort“ für kurze Wörter (z. B. *tee*, damit *Teelichter* nicht zu Tee wird).
  Gelernte Artikel (eure Korrekturen) haben immer Vorrang.
- **Mehr → Kleine Gruppen zusammenfassen:** Untergruppen unter X % ihrer Hauptgruppe
  erscheinen in der Übersicht gesammelt als „Weitere“ – so gibt es keine Mini-Gruppen für Einzelartikel.
- **Mehr → Aufräum-Vorschläge:** zeigt Untergruppen, die (nach genug Einkäufen) kaum genutzt werden,
  und legt sie per Tipp mit der Hauptgruppe zusammen.
- **Mehr → Alle Belege neu zuordnen:** wendet geänderte Regeln auf alte Belege an
  (von Hand korrigierte Artikel bleiben).

## Gut zu wissen

- **Supabase (kostenloser Plan)** pausiert Projekte nach längerer Inaktivität. Bei täglicher Nutzung kein Thema;
  falls doch: im Supabase-Dashboard *Restore* klicken – es gehen keine Daten verloren.
- **Backup:** Mehr → *Backup exportieren* (z. B. monatlich in iCloud Drive ablegen).
- **Update der App:** geänderte Dateien neu hochladen und in `sw.js` die Zeile `CACHE = 'haushalt-v1'`
  hochzählen (`v2`, …). Beim nächsten Öffnen ist die neue Version da – Daten bleiben erhalten.
- **Datenschutz:** Bon-Fotos werden **auf dem iPhone** gelesen und **nicht** gespeichert oder hochgeladen,
  nur die erkannten Positionen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche & Design |
| `app.js` | App-Logik, Sync, Scan, Editoren |
| `logic.js` | Bon-Erkennung, Standard-Gruppen & -Stichwörter, Zuordnung |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installierbarkeit & Offline |
| `supabase_setup.sql` | Einmalig in Supabase ausführen |
