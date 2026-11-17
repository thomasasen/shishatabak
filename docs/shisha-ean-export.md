# Shisha-EAN-Export – korrigierter Stand, 17.11.2026

Die ursprüngliche Version filterte generische Shopartikel wie „Almassiva Shisha Tabak 200g“ bereits in der Kategorie aus und fand deshalb null Produktseiten. Die korrigierte Version öffnet solche Sammelartikel und folgt **nur expliziten Links auf einzelne Sorten/Packungsgrößen**. Sie ordnet einer Auswahlbox niemals eine vermutete GTIN zu.

## Windows PowerShell

`shisha_ean_export.py` und `check_shisha_export.py` in den gewünschten Arbeitsordner kopieren. Der Dateiname muss exakt `shisha_ean_export.py` sein (nicht `shisha_ean_export(2).py`).

```powershell
py -3 -m pip install requests beautifulsoup4
py -3 .\shisha_ean_export.py --site blubberhaus --max-pages 1 --max-products 20
py -3 .\shisha_ean_export.py --site shisha-shop --max-pages 1 --max-products 20
```

Danach, falls der erste Abruf erfolgreich war und die Website keine Zugriffssperre setzt:

```powershell
py -3 .\shisha_ean_export.py --site blubberhaus --max-pages 3 --max-products 100 --delay 1.5
py -3 .\shisha_ean_export.py --site shisha-shop --max-pages 3 --max-products 100 --delay 1.5
```

Das Skript erzeugt je Shop `*_verified.csv`, `*_review.csv`, `*_report.json` und `*_catalog_candidates.json` unter `shisha-export`. Es prüft GTIN-Prüfziffer, konkrete Einzelproduktseite und Packungsgröße. Die Dateien werden nicht ohne Abgleich automatisch in GitHub aufgenommen.

## EAN-Dubletten gegen unser Repository prüfen

Im Wurzelverzeichnis einer aktuellen lokalen Kopie von `https://github.com/thomasasen/shishatabak` (mit `catalog/products.json`) und mit den beiden exportierten JSON-Dateien:

```powershell
py -3 .\check_shisha_export.py --catalog .\catalog\products.json --input .\shisha-export\blubberhaus_catalog_candidates.json .\shisha-export\shisha-shop_catalog_candidates.json
```

Das Hilfsskript erzeugt `shisha-export/abgleich/new_candidates.json`, `review_candidates.json` und `already_known_conflicts.json`. Es verändert den Hauptkatalog **nicht**. Identische oder auf 14 Stellen gleichwertige EANs werden nicht doppelt übernommen; Varianten mit gleicher Marke/Sorte/Größe, aber unterschiedlicher GTIN kommen zur Prüfung.

## Grenzen

- Das Skript läuft mit HTTP-Abständen und beachtet `robots.txt`, aber Nutzungs- und Datenbankrechte sind unabhängig davon zu klären.
- Bei 403/429 bzw. CAPTCHA wird nicht weiter abgerufen. Die Lösung ist dann ein offizieller Produktfeed oder eine Erlaubnis des Händlers, keine Sperrenumgehung.
- Manche Varianten werden dynamisch erzeugt und haben keine direkt auffindbaren Einzelprodukt-URLs. Solche Datensätze bleiben zunächst offen.
- Die Software wurde lokal mit HTML-Testfällen geprüft. Eine vollständige Live-Prüfung der beiden Shops war in dieser Umgebung nicht möglich.