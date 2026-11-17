# Tabakjournal

Ein schlanker, privater Pilot für die Verwaltung von Shisha-Tabaken und die Dokumentation von Geschmack und Beschwerden. Ausgelegt auf **NOCCA eHMD ohne Kohle**.

## GitHub Pages

Die Anwendung ist **rein statisch**: kein Build, kein Server, keine externen Skripte. Alle für GitHub Pages benötigten Dateien liegen direkt im Root des Branches **main**.

**Einmalige Aktivierung:** GitHub → Repository → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: /(root) → Save**.

Danach ist die erwartete URL: https://thomasasen.github.io/shishatabak/

> Der Commit allein aktiviert GitHub Pages nicht. Ob die Pages-Einstellung im Repository gesetzt ist, muss in den Settings kontrolliert werden.

## Was der Pilot bereits kann

- Hersteller-/Sorten-Autovervollständigung aus einem **kleinen lokalen Starterkatalog** mit exemplarischen, öffentlich dokumentierten Produkten; zusätzlich Herstellervorschläge und freie Eingabe.
- Tabake anlegen, bearbeiten und löschen (Hersteller, Sorte, Grundtabak, Geschmack, Notizen).
- Sessions erfassen, bearbeiten und löschen: Datum, Tabak, Geschmack (1–5), Beschwerden (0–3), Symptome, Dauer, NOCCA-Temperatur und Kopf.
- Übersicht und Auswertungen nach Grundtabak und Hersteller mit sichtbarer Fallzahl.
- Dauerhafte Speicherung über **localStorage** im selben Browser, auch nach Browserneustart.
- JSON-Export und validierter JSON-Import als **Zusammenführen** oder **Ersetzen**. Einträge sind mit IDs verknüpft; beim Zusammenführen werden doppelte Produkte anhand von Hersteller und Sorte erkannt.
- Responsive Darstellung für Desktop und Smartphone.

## Wichtige Grenzen

- **Keine vollständige Shisha-Datenbank:** Die Vorschläge sind ein kleiner Offline-Starterkatalog, keine laufend synchronisierte Händler-/Hersteller-API. Produktattribute können sich ändern und sollten überprüft werden.
- **Keine Geräte-Synchronisation.** Jeder Browser hat seine eigene lokale Sammlung. Daten können durch Löschen der Websitedaten, privaten Modus oder Browser-Bereinigung verloren gehen. Regelmäßig ein JSON-Backup herunterladen.
- **Keine medizinische Diagnose.** Beschwerden wie Schwindel oder Übelkeit sind auch bei elektrischer Beheizung möglich. Die App dokumentiert nur individuelle Beobachtungen und weist keine Ursache nach.
- Keine Anmeldung, kein Server, keine Cloud-Datenbank, keine Tracking-Skripte, keine Tabakwerbung.
- Backup-Dateien enthalten persönliche Angaben und sollten vertraulich behandelt werden.

## Dateien

| Datei | Zweck |
| --- | --- |
| index.html | Oberfläche und Navigation |
| styles.css | Darstellung und Mobile-Layout |
| app.js | Datenmodell, CRUD, Suche, Auswertung, Import/Export |
| favicon.svg | Programmsymbol |
| .nojekyll | Auslieferung ohne Jekyll-Transformation |

## Datenformat

Der lokale Schlüssel lautet \`tabakjournal:v1\`. JSON-Backups verwenden \`{ "app": "tabakjournal", "version": 1, "tobaccos": [], "sessions": [], "settings": {} }\`.

## Entwicklungsstart

Zum lokalen Test mit Webserver (empfohlen, statt \`file://\`):

\`\`\`bash
python -m http.server 8000
\`\`\`

Dann http://localhost:8000 öffnen. Kein Node.js oder Build notwendig.

## Quellen des exemplarischen Starterkatalogs

Einige Produktnamen und Geschmacksprofile wurden anhand der öffentlich sichtbaren Markenverzeichnisse von [SmokeDex](https://smokedex.info/de/tabak) verifiziert. Es werden keine Seiten automatisiert ausgelesen und keine Shop-Daten remote geladen. Vor einer automatischen Übernahme umfangreicher Fremddaten müssen API-Verfügbarkeit und Nutzungsrechte geprüft werden.

## Geplante Erweiterungen

Freigegebene Produktfeeds und Katalogimporte, Barcode-Scan, lokale Bild-/OCR-Erkennung, CSV-Export, nutzerdefinierte Stichwörter und genauere temperaturbezogene Auswertungen.
