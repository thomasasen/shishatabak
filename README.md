# Tabakjournal – Verträglichkeit meiner Tabake

Eine kleine, private Webapp, in der du **jeden Tabak genau einmal bewertest**. Das wichtigste Kriterium ist die **persönliche Verträglichkeit**.

**App:** https://thomasasen.github.io/shishatabak/

## Das kann die App

- **Tabak hinzufügen:** Hersteller und Sorte eingeben. Die automatische Vervollständigung nutzt den vorhandenen lokalen Produktkatalog mit 994 GTIN-Einträgen (878 zusammengefasste Sorten-/Packungsgrößen-Varianten). Ein Treffer übernimmt Hersteller, Sorte, Packungsgröße und verfügbare Angaben zu Grundtabak und Geschmacksrichtung.
- **Verträglichkeit bewerten:** Pro Tabak eine dauerhafte Einschätzung von **1 (sehr schlecht)** bis **5 (sehr gut)**. Sie ist die Hauptinformation jeder Tabakkarte.
- **Optionale Details:** Geschmack von 1 bis 5, beobachtete Beschwerden (Schwindel, Übelkeit, Kopfschmerzen, Herzrasen, andere Beschwerden) und eine freie Notiz.
- **Bearbeiten und vergleichen:** Verträglichkeit steht als große Zahl und Klartext auf jeder Karte; Suche und Filter für gut/schlecht verträgliche und nicht bewertete Sorten. Die Suche aktualisiert nur Treffer, ohne beim Tippen das Eingabefeld zu ersetzen.
- **Backup:** Persönliche Daten als JSON exportieren, importieren, zusammenführen oder ersetzen. Keine Anmeldung, kein Backend und keine Cloud-Synchronisation.

**Bewusst entfernt:** Session-Tagebuch und Session-Auswertungen, die Bestandsverwaltung als sichtbare Funktion, Barcode-/Kameraerkennung und externe EAN-Abfragen. Die App konzentriert sich auf **Meine Tabake**. **Backup** ist als sekundäre Werkzeugleisten-Aktion erreichbar.

## Bewertungsprinzip

Die Verträglichkeitsbewertung beschreibt die persönliche Gesamteinschätzung einer Sorte. Sie wird **nicht aus einer früheren Session oder aus dem Symptomfeld abgeleitet**. Bei nicht bewerteten Altbeständen erscheint „Noch nicht bewertet“, bis du selbst eine Bewertung vergibst.

| Wert | Verträglichkeit |
| --- | --- |
| 1 | Sehr schlecht |
| 2 | Schlecht |
| 3 | Mittel |
| 4 | Gut |
| 5 | Sehr gut |

Geschmacksbewertung, Symptome und Notiz sind optional. Aus subjektiven Notizen lassen sich keine sicheren medizinischen Ursachen ableiten. Bei Beschwerden den Konsum beenden und wiederkehrende Symptome ärztlich abklären.

## Alte Daten und Backups

Das bisherige lokale Speicherformat `tabakjournal:v1` und ältere JSON-Dateien bleiben gültig. Bestehende **Tabake und Produktkennungen** werden übernommen. Frühere **Bestandswerte und Sessioneinträge** bleiben intern bzw. im JSON-Backup erhalten, obwohl die Oberfläche keine Sessions oder Packungsverwaltung mehr anbietet. Historische Sessionbewertungen werden nicht automatisch in die neue Gesamtnote umgerechnet.

Die neue Einzelbewertung wird pro Tabak als `review` gespeichert:

```json
{
  "tolerability": 4,
  "taste": 3,
  "symptoms": ["Kopfschmerzen"],
  "notes": "Meine persönliche Einschätzung",
  "updatedAt": "2026-11-18T15:30:00.000Z"
}
```

Beim **Zusammenführen** hat eine bereits vorhandene lokale Bewertung Vorrang. Importierte Bewertungen füllen lediglich noch nicht bewertete Einträge. Beim **Ersetzen** wird die gesamte lokale Sammlung durch die Backup-Datei ersetzt. Das Löschen eines Tabaks entfernt auch dessen früher zugeordnete Daten, worauf vorher hingewiesen wird. Exportiere deshalb vor Änderungen ein Backup.

## Produktkatalog

[Der Produktkatalog](catalog/products.json) enthält weiterhin 994 eindeutige, quellenverknüpfte GTINs aus 71 Marken beziehungsweise Produktlinien. Die Browserdatei [catalog.js](catalog.js) wird daraus erzeugt. Die Produktsuche läuft ausschließlich lokal und benötigt keine Kamera, keinen Barcode-Scanner und keine Online-API. Für nicht im Katalog enthaltene Sorten ist eine freie Eingabe möglich.

Die Skripte unter [scripts](scripts) dienen nur der **separaten Pflege des Datenbestands** und sind kein Teil der Bedienoberfläche. Details stehen in den [Katalog-Auditdaten](catalog/audit-report.json) und dem [Importbericht](catalog/shisha-shop-import-report.json).

## Oberfläche

Die Oberfläche wurde anhand von [Unslop von Damir Sokolovsky](https://github.com/heydamir/unslop) (CC BY 4.0) überarbeitet. Das ruhige, warme Graphit-/Papierdesign verwendet einheitliche Abstände, neutrale Flächen, dezente Zustandsfarben und kompakte Tabakzeilen. Die fünf Shisha-Symbole und die eigens gestalteten Beschwerdeillustrationen bleiben der visuelle Schwerpunkt. Hell-/Dunkelmodus, Tastaturfokus, die zugängliche Bewertungssteuerung und die beim Scrollen sichtbaren Dialogaktionen bleiben erhalten. Die [Unslop-Designprüfung vom 20.11.2026](docs/unslop-design-20261120.md) dokumentiert Gestaltung, Audit und Testumfang. Das frühere [Apple-HIG-Red-Team-Protokoll](docs/red-team-apple-bewertungs-gui-20261118.md) bleibt als historischer Stand erhalten.

## Lokal starten und testen

```bash
python -m http.server 8000
```

Danach http://localhost:8000 öffnen. Für GitHub Pages kann die App direkt aus dem Root des Branches `main` veröffentlicht werden.

```bash
node --check app.js
node scripts/build-catalog.mjs --check
node --test tests/*.test.mjs
python -m scripts.audit_catalog
```

GitHub Actions führt außerdem die bestehenden Import- und Katalogtests aus.
