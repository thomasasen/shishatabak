# Tabakjournal

Private Webapp zur Verwaltung der eigenen Shisha-Tabake, des Packungsbestands und persönlicher Session-Notizen. Sie läuft ohne Benutzerkonto und speichert die persönliche Sammlung ausschließlich im Browser.

**Webapp:** https://thomasasen.github.io/shishatabak/

## Funktionen

- **Meine Tabake:** Tabak erfassen, bearbeiten, löschen und nach Hersteller, Sorte oder Geschmack suchen.
- **Automatische Produktvorschläge:** Beim Eingeben von Hersteller oder Sorte schlägt die App passende Einträge aus dem bestehenden Produktkatalog vor. Ein Klick übernimmt **Hersteller, Sorte, Packungsgröße sowie bekannte Grundtabak- und Geschmacksangaben**. Das Formular bleibt frei bearbeitbar; nicht gefundene Sorten lassen sich manuell anlegen.
- **Packungsbestand:** Anzahl, Packungsgröße und Öffnungsstatus erfassen; Bestand über +/− ändern. Ein Bestand von null löscht keine Sessions.
- **Sessions:** Datum, Geschmack, Beschwerden, Dauer, NOCCA-Temperatur, Kopf und Notizen dokumentieren.
- **Übersicht und Auswertung:** Persönliche Sammlung, vergangene Sessions und deren Auswertungen.
- **Backup:** JSON-Export und validierter Import als Zusammenführen oder Ersetzen. Auch ältere Version-1-Backups sind kompatibel.

**Bewusste Vereinfachung:** Die App hat **keinen Barcode-Scanner**, keinen Zugriff auf die Kamera, keine Fotoerkennung und keine externe EAN-Namensabfrage. Es gibt nur noch einen Ablauf zum Erfassen eines Tabaks mit automatischen Katalogvorschlägen. Der bestehende Produktkatalog bleibt unverändert.

## Produktkatalog

Die kanonische Datei [catalog/products.json](catalog/products.json) enthält **994 eindeutige, quellenverknüpfte GTIN-Datensätze** aus **71 Marken beziehungsweise Produktlinien** (Stand 18.11.2026). [catalog.js](catalog.js) ist die generierte Browserfassung. Mehrere GTIN-Ausgaben derselben Sorte und Packungsgröße erscheinen in der Eingabe **nur als ein Vorschlag**. Unterschiedliche Packungsgrößen bleiben getrennt auswählbar.

Unbekannte Daten werden nicht geraten. Wenn Grundtabak oder Geschmacksprofil nicht belegt sind, bleiben diese Angaben unverifiziert beziehungsweise leer. Die Produktvorschläge werden vollständig aus dem bereits geladenen Katalog gebildet; das Tippen löst **keine externen Webanfragen** aus.

Die Python-Skripte unter [scripts](scripts) dienen ausschließlich der **separaten Katalogpflege** und den Importprüfungen, nicht der laufenden Produkterkennung in der Webapp. Die konservative Prüfung neuer GTINs verhindert doppelte Katalogeinträge. Dokumentation: [Shop-Exporter](docs/shisha-ean-export.md), [Importbericht](catalog/shisha-shop-import-report.json), [Qualitätsprüfung](catalog/audit-report.json).

## Speicherung und Datenschutz

- Alle persönlichen Tabake und Sessions werden unter `tabakjournal:v1` in `localStorage` gespeichert.
- Bestehende Einträge und Backups behalten ihre früher erfassten Produktkennungen intern. Die frühere Barcode-Bedienoberfläche ist entfernt. Alte Produktdaten werden dadurch nicht unbemerkt gelöscht.
- Beim Bearbeiten einer Sorte oder Packungsgröße kann die bisherige interne Produktkennung durch eine neu gewählte Katalogzuordnung ersetzt werden. Packungsbestand und Sessions bleiben mit der persönlichen Eintrags-ID verknüpft.
- Es gibt weder Synchronisation zwischen Geräten noch ein Benutzerkonto. Browserdaten können gelöscht werden; **regelmäßig JSON-Backups exportieren**.
- Der Katalog wird statisch geladen. Er erfordert keine Freigabe von Kamera oder Mikrofon.
- Session-Protokolle dienen der persönlichen Dokumentation, nicht der medizinischen Diagnose.

## Bedienung

1. **Meine Tabake → Tabak erfassen** öffnen.
2. Hersteller oder Sorte eingeben. Passenden Vorschlag mit der richtigen Packungsgröße auswählen.
3. Bei Bedarf Angaben ergänzen, Bestand und Öffnungsstatus eintragen und **Tabak speichern** wählen.
4. Optional eine Session erfassen. Die Bestandszahl kann direkt in der Sammlung geändert werden.

## Oberfläche

Die responsive Weboberfläche orientiert sich an grundlegenden Prinzipien der Apple Human Interface Guidelines: klare Navigation, Systemtypografie, Hell-/Dunkelmodus und barrierearme Bedienung. Die App ist **keine native Apple-App**. Das [Design-Red-Team-Protokoll](docs/apple-hig-red-team.md) dokumentiert die Gestaltung. Die dort erwähnte frühere Scannerfunktion wurde mit der Vereinfachung entfernt.

## Lokal entwickeln

Es handelt sich um eine statische Anwendung ohne App-Build und ohne Server-Backend:

```bash
python -m http.server 8000
```

Danach http://localhost:8000 öffnen. Bei GitHub Pages muss `main` als Deployment-Branch mit Ordner `/(root)` eingerichtet sein.

**Prüfungen:**

```bash
node --check app.js
node scripts/build-catalog.mjs --check
node --test tests/*.test.mjs
python -m scripts.audit_catalog
```

Die Katalog-Pipelines in `scripts/` besitzen eigene Python-Tests. GitHub Actions führt die vorgesehenen Prüfungen bei jedem Pull Request durch.
