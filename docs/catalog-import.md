# Automatischer Produktimport

Der Importer erfasst nachprüfbare Produktfakten: GTIN, Hersteller, Name, Gewicht und einzelne Quell-URL. Er übernimmt weder Produktfotos noch fremde Rezensionen oder längere Beschreibungen.

## Aktive Quellen

- Datakick: öffentlicher CC0-Gesamtdownload https://gtinsearch.org/items.csv. Nur eindeutig erkennbare Shisha-Produkte mit Packungsgröße werden übernommen.
- Shisha-Nil und Shisharia: öffentliche individuelle Produktseiten, soweit robots.txt das Abrufen erlaubt. Kategorien und Sitemaps dienen zur Ermittlung.
- EAN-Suche.net: Bereits als Live-Abfrage in der Webapp; kein Bulkexport vorhanden.

## Grenzen und Rechte

Zuerst wird robots.txt geprüft. Wenn dessen Abruf fehlschlägt oder die Seite den Bot sperrt, wird die Quelle übersprungen. Kein Proxy, kein Login, keine CAPTCHA-Umgehung, kein Umgehen von Zugriffssperren. Mindestens 1,2 Sekunden Pause zwischen Requests, bis zu 105 Anfragen und 55 geprüfte Produktseiten je Shop und Lauf. Umfangreiche Übernahmen aus fremden Datenbanken erfordern zusätzlich geeignete Nutzungsrechte. SmokeDex, ShishaTobaccos sowie Dölid/Shisha WG werden daher nicht automatisch vollständig kopiert.

## Qualitätsprüfung

- EAN-/GTIN-Prüfziffer muss stimmen.
- Haupttitel muss Hersteller, Sorte und konkrete Packungsgröße nennen.
- GTIN muss eindeutig auf der Einzelproduktseite stehen. Mehrdeutige Treffer werden ausgelassen.
- Unbekannter Grundtabak bleibt Unbekannt statt geraten zu werden.
- Bereits vorhandene EANs werden nicht überschrieben; persönliche Daten liegen nur im Browser.

## Ausführung

Python-Pakete installieren: `python -m pip install 'requests>=2.32,<3' 'beautifulsoup4>=4.12,<5'`

Parser prüfen: `python -m unittest discover -s scripts -p test_import_products.py -v`

Daten abrufen: `python scripts/import_products.py --max-requests 105 --max-products 55 --delay 1.2`

Katalog erzeugen und prüfen: `node scripts/build-catalog.mjs && node scripts/build-catalog.mjs --check && node --test tests/*.test.mjs`

Der GitHub-Workflow läuft bei der Einrichtung, montags oder manuell. Er erzeugt `catalog/import-report.json` und einen eigenen Branch `data/collect-RUN_ID` für den anschließenden Review. Erst nach dem Merge auf main stehen neue Daten auf GitHub Pages zur Verfügung.

Der Importbericht ist maßgeblich: Wenn Quellen robots-gesperrt, nicht erreichbar oder nicht eindeutig auswertbar sind, werden keine zusätzlichen Produkte behauptet.