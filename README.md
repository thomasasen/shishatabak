# Tabakjournal

Ein schlanker, privater Pilot für die Verwaltung von Shisha-Tabaken und die Dokumentation von Geschmack und Beschwerden. Ausgelegt auf **NOCCA eHMD ohne Kohle**.

## GitHub Pages

Die Anwendung ist **rein statisch**: kein Build und kein eigener Backend-Server. Katalog, Benutzeroberfläche und persönliche Datenspeicherung funktionieren lokal im Browser. Beim **Start des Barcode-Scanners** wird die Bibliothek `html5-qrcode` bei Bedarf von einem CDN geladen; für eine unbekannte EAN kann zudem eine öffentliche EAN-Datenbank abgefragt werden. Dabei wird nur die EAN übertragen, nicht deine Sammlung. Alle für GitHub Pages benötigten App-Dateien liegen im Root von **main**.

**Einmalige Aktivierung:** GitHub → Repository → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: /(root) → Save**.

Danach ist die erwartete URL: https://thomasasen.github.io/shishatabak/

> Der Commit allein aktiviert GitHub Pages nicht. Ob die Pages-Einstellung im Repository gesetzt ist, muss in den Settings kontrolliert werden.

## Was der Pilot bereits kann

- Hersteller-/Sorten-Autovervollständigung aus einem **recherchierten lokalen Produktkatalog** mit exemplarischen, öffentlich dokumentierten Produkten; zusätzlich Herstellervorschläge und freie Eingabe.
- Eigene Tabake über **994 recherchierte EAN-/GTIN-Katalogeinträge**, Barcode-Scan oder manuelle Eingabe erfassen; **Packungsgröße, Packungsanzahl und Öffnungsstatus** verwalten (auch direkt per +/− in der Sammlung). Bestehende Einträge und Sessions bleiben beim Anpassen des Bestands erhalten.
- Tabake anlegen, bearbeiten und löschen (Hersteller, Sorte, Grundtabak, Geschmack, Packungsgröße, Bestand, Öffnungsstatus, EANs und Notizen).
- Sessions erfassen, bearbeiten und löschen: Datum, Tabak, Geschmack (1–5), Beschwerden (0–3), Symptome, Dauer, NOCCA-Temperatur und Kopf.
- Übersicht und Auswertungen nach Grundtabak und Hersteller mit sichtbarer Fallzahl.
- Dauerhafte Speicherung über **localStorage** im selben Browser, auch nach Browserneustart.
- JSON-Export und validierter JSON-Import als **Zusammenführen** oder **Ersetzen**. Einträge sind mit IDs verknüpft; beim Zusammenführen werden doppelte Produkte anhand von Hersteller und Sorte erkannt.
- Responsive, an Apples Human Interface Guidelines orientierte **vollständig überarbeitete Oberfläche**: Seitenleiste auf dem Desktop, untere Fünf-Tab-Navigation auf Smartphones, einheitliche SVG-Icons, Hell-/Dunkelmodus nach Systemeinstellung, sichtbarer Tastaturfokus, reduzierte Bewegung und Transparenzerhöhung auf Wunsch.
- Red-Team-Audit mit **rechnerisch geprüftem Farbkontrast**: [Befunde, Korrekturen und verbleibende Plattformgrenzen](docs/apple-hig-red-team.md).

## Wichtige Grenzen

- **Keine vollständige Shisha-Datenbank:** Die Vorschläge sind ein kuratierter Offline-Produktkatalog, keine laufend synchronisierte Händler-/Hersteller-API. Produktattribute können sich ändern und sollten überprüft werden.
- **Bestandszahlen sind Packungen, nicht tatsächliche Gramm-Restmengen.** Eine geöffnete Dose wird nicht automatisch durch das Erfassen einer Session verbraucht. Alte Backups ohne Bestandsfelder werden als 1 Packung mit unbekannter Größe und geschlossenem Status interpretiert; beim Zusammenführen gilt die höhere Bestandszahl statt einer Summe, um wiederholte Importe nicht doppelt zu zählen.
- **Keine Geräte-Synchronisation.** Jeder Browser hat seine eigene lokale Sammlung. Daten können durch Löschen der Websitedaten, privaten Modus oder Browser-Bereinigung verloren gehen. Regelmäßig ein JSON-Backup herunterladen.
- **Keine medizinische Diagnose.** Beschwerden wie Schwindel oder Übelkeit sind auch bei elektrischer Beheizung möglich. Die App dokumentiert nur individuelle Beobachtungen und weist keine Ursache nach.
- Keine Anmeldung, kein Server, keine Cloud-Datenbank, keine Tracking-Skripte, keine Tabakwerbung.
- Backup-Dateien enthalten persönliche Angaben und sollten vertraulich behandelt werden.

## Dateien

| Datei | Zweck |
| --- | --- |
| index.html | Oberfläche, SVG-Symbole und responsive Navigation |
| styles.css | Semantische Design-Tokens, Light/Dark Mode, flexible Layouts und Barrierefreiheit |
| app.js | Datenmodell, CRUD, Suche, Auswertung, Import/Export |
| favicon.svg | Programmsymbol |
| .nojekyll | Auslieferung ohne Jekyll-Transformation |

## Überarbeitete Apple-HIG-orientierte Oberfläche

Die Oberfläche wurde auf Grundlage des Projekts [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill) überarbeitet. Sie ist **weiterhin eine Webapp**, keine native iOS-/macOS-App: Grundprinzipien wie Lesbarkeit, Kontrast, Bedienelemente, Navigation und Zugänglichkeit werden für HTML/CSS umgesetzt, ohne native Apple-Systemeffekte zu behaupten. Die fünf Bereiche sind auf dem Smartphone über eine feste untere Navigation erreichbar; ab größeren Breiten erscheint eine Seitenleiste. Eingaben in Dialogen werden beim Verwerfen geschützt. Persönliche Tabake, Sessions und JSON-Backups bleiben unverändert kompatibel.

Weitere Details: [Red-Team-Protokoll](docs/apple-hig-red-team.md).

## Meine Tabake erfassen

Im Bereich **Meine Tabake** führt **Aus Katalog erfassen** zu einer Suche in den 994 Katalogeinträgen (Hersteller, Sorte, EAN und Geschmack). **Erfassen** übernimmt Hersteller, Sorte, Grundtabak, falls bekannt, die richtige Packungsgröße und GTIN in ein bearbeitbares Formular. Trage die Anzahl deiner vorhandenen Packungen und bei Bedarf „Mindestens eine Packung geöffnet“ ein. **Tabak speichern** legt den Eintrag ausschließlich im Browser an. Bereits gespeicherte Sorten werden zum Bearbeiten geöffnet, statt eine Dublette anzulegen.

Alternativ kannst du **Barcode scannen** oder **Manuell erfassen** verwenden. Wenn du eine bereits bekannte Dose erneut scannst, kannst du direkt **Eine Packung hinzufügen** wählen. Die Karten der Sammlung bieten +/− zum Anpassen des Bestands; 0 Packungen löscht weder Sorte noch Sessions. Der JSON-Export/Import enthält die neuen Inventarfelder. Bestehende Backups der Version 1 bleiben importierbar. Die Erfassung lädt keine persönlichen Bestandsdaten auf einen Server.

## Datenformat

Der lokale Schlüssel lautet \`tabakjournal:v1\`. JSON-Backups verwenden \`{ "app": "tabakjournal", "version": 1, "tobaccos": [], "sessions": [], "settings": {} }\`.

## Verbesserter lokaler Shop-Exporter (JTL-Varianten)

Die Python-Skripte [scripts/shisha_ean_export.py](scripts/shisha_ean_export.py) und [scripts/check_shisha_export.py](scripts/check_shisha_export.py) untersuchen Blubberhaus, Shisha-Shop.de und SUN-VI. Sammelartikel werden nur über tatsächliche Unterseiten einzelner Sorten aufgelöst, **nicht** durch das Erraten einer EAN. Ein konservativer EAN-Abgleich verhindert die doppelte Aufnahme bereits vorhandener GTINs. [Befehle und Grenzen](docs/shisha-ean-export.md).

```powershell
py -3 -m pip install requests beautifulsoup4
py -3 .\\scripts\\shisha_ean_export.py --site blubberhaus --max-pages 1 --max-products 20
py -3 .\\scripts\\shisha_ean_export.py --site shisha-shop --max-pages 1 --max-products 20
py -3 .\\scripts\\check_shisha_export.py --catalog .\\catalog\\products.json --input .\\shisha-export\\blubberhaus_catalog_candidates.json .\\shisha-export\\shisha-shop_catalog_candidates.json
```

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

## Recherchebasierte EAN-Datenbank und Scanner (v0.2)

Die Datenbank befindet sich unter [catalog/products.json](catalog/products.json). Sie enthält **994 EAN-/GTIN-Einträge** aus **71 Marken bzw. Produktlinien** mit EAN/GTIN, Packungsgröße, Quellenlink und Prüfdatum. Die Datei [catalog.js](catalog.js) wird daraus für die statische Webapp erzeugt. Prüfskript: `node scripts/build-catalog.mjs --check`.

Oben **Barcode scannen** wählen und die Handykamera auf den Strichcode richten. Alternativ Foto oder manuelle EAN-Eingabe. Der Scanner erkennt EAN-13, EAN-8 und UPC-A. Ein gefundener Tabak lässt sich direkt der Sammlung hinzufügen. Unbekannte EANs können einmalig einem neuen oder vorhandenen Tabak zugeordnet werden. Diese Zuordnungen bleiben lokal gespeichert und werden mit dem bestehenden JSON-Backup exportiert/importiert.

**SUN-VI-Import vom 17.11.2026:** 104 neue EANs und 90 ergänzte Geschmacksprofile ohne Überschreiben bestehender Identitäten. Die Prüfung und Konflikte stehen im [SUN-VI-Importbericht](catalog/sunvi-import-report.json).

**Shisha-Shop.de-Import vom 18.11.2026:** 235 neue eindeutige GTINs aus einem 360-Zeilen-Export; 125 vorhandene GTINs unverändert gelassen. 515 unsichere Produktseiten ausgeschlossen. Alternative GTINs derselben Sorte sowie der Packungsgrößenkonflikt bei Savu 2ana sind im [Importbericht](catalog/shisha-shop-import-report.json) dokumentiert.

**Transparenz und Grenzen:** Der Katalog ist keine vollständige Liste aller erhältlichen Tabake. Er wird aus Einzelnachweisen unterschiedlicher Shops gepflegt; die Quelle steht bei jedem Produkt. Es gibt keinen unautorisierten automatischen Shop-Crawler. Manche Quellen führen verschiedene Packungsgrößen unter abweichenden EANs; die Angaben der gescannten Dose sind maßgeblich.

**Influencer:** [Doelid](https://doelid.de/mix/) dokumentiert über 250 Mixe. [Shisha WG](https://www.youtube.com/@ShishaWG) veröffentlicht Reviews und Ranglisten. Diese Quellen helfen bei Produktnamen und Aromaprofilen, liefern jedoch keine systematische Zuordnung von EAN zu konkreter Packungsgröße. Es werden keine fremden Bewertungslisten kopiert.

Die Erkennung verwendet **html5-qrcode 2.3.8**, das erst bei Kamera- oder Fotoerkennung über jsDelivr geladen wird. Bilder werden zur Erkennung lokal verarbeitet und nicht an einen Produkterkennungsdienst hochgeladen. Die Seite benötigt HTTPS und eine Freigabe für die Kamera.

### Online-Nachschlagen für unbekannte EANs

Die App prüft neue Scans in dieser Reihenfolge: **(1) eigene Sammlung, (2) versionierter Katalog, (3) Online-Namenssuche bei EAN-Suche.net**, danach manuelle Zuordnung. Erst wenn eine EAN weder lokal noch im Katalog vorhanden ist, wird sie an `https://ean-suche.net/api/produkt/{ean}` gesendet. Bei einem Treffer wird der Name **nur als bearbeitbarer Vorschlag** übernommen; Hersteller, Tabaksorte und Packungsgröße müssen anhand der Dose überprüft werden. Bei 404, 429, Netzwerk- oder CORS-Fehlern bleibt die lokale Erfassung möglich. Der Dienst nennt 60 Anfragen/Stunde/IP und verlangt bei öffentlicher Nutzung eine Quellenangabe; die App zeigt den Quelllink im Footer und Scan-Dialog.

Andere recherchierte Quellen für zukünftige Integrationen: OpenGTINDB (API-Bedingungen beachten), UPCitemdb (kostenloses Trial-Kontingent), Datakick/GTINSearch (offene API), Verified by GS1 (max. 30 kostenlose Abfragen/Tag für Nutzer), professionelle EAN-Suche.de (kostenpflichtig) sowie Hersteller-/Großhandels-Feeds. Händler-Kataloge und Community-Listen wie SmokeDex, ShishaTobaccos und Dölid eignen sich zur Qualitätsanreicherung, dürfen aber nicht ohne passende Rechte vollumfänglich kopiert werden.

## Korrektur: Argileh ORNG MNT (17.11.2026)

Die 200-g-Sorte **Argileh ORNG MNT** (Orange/Minze, Virginia) wird auch unter **OG&M** und **OMI** angeboten. Zwei unabhängig belegte EANs sind nun auf denselben kanonischen Produktnamen gemappt:

- `4260623442977` – [Shisha-Nil](https://www.shisha-nil.de/argileh-tobacco-200g-og-m)
- `4260623441833` – [Shisharia](https://shisharia.de/Argileh-Shisha-Tabak-200g-Orng-Mnt)

Suche und Barcodezuordnung berücksichtigen die alternativen Namen. Bereits lokal als OG&M angelegte Tabake können dem neuen Code zugeordnet werden, statt doppelt angelegt zu werden. Bei anderen EANs oder Herstellern muss die konkrete Dose separat überprüft werden.

## Kamera-Zuverlässigkeit (17.11.2026)

Ein Beispielscan einer Argileh-ORNG-MNT-Dose ergab `0050674441883`. Diese Nummer ist formal eine gültige EAN-13 beziehungsweise UPC-A `050674441883`, wird jedoch bislang durch keine Produktquelle Argileh zugeordnet. Die beiden belegten 200-g-EANs sind `4260623442977` und `4260623441833`.

Die Scannerkamera verlangt deshalb nun **drei zeitlich getrennte übereinstimmende Decodes**, statt das erste prüfziffergültige Ergebnis sofort anzunehmen. Im Ergebnisdialog zu unbekannten Codes wird auf den Vergleich mit der unter dem Strichcode gedruckten Nummer hingewiesen. Damit werden zufällige Fehllesungen reduziert; drei übereinstimmende Reads beweisen allerdings noch keine Herstellerzuordnung. Ohne Nachweis wird der fragliche Code nicht in die gemeinsame Produktdatenbank aufgenommen.

### Red-Team Barcode-Decoder (17.11.2026)

Ausgangslage: Verschiedene formal gültige Codes mit auffällig vielen führenden Nullen wurden beim Scan einer Argileh-Dose erkannt, ohne dass die Produktidentität belegt war.

Maßnahmen:
- **Standardmodus nur EAN-13.** UPC-A und EAN-8 sind über einen bewusst aktivierbaren Zusatzmodus erhältlich; UPC-E ist ausgeschlossen, solange die saubere Expansion auf GTIN nicht implementiert wurde.
- Bei Kamerascans werden gemeldete Barcodeformate vor der Annahme überprüft. Drei übereinstimmende Bilder bleiben notwendig.
- Ein unbekannter Barcode kann jetzt durch Eingabe der gedruckten Ziffern erneut geprüft werden, ohne die Kamera neu zu starten.
- Unbekannte Codes dürfen erst nach Bestätigung des physischen Aufdrucks dauerhaft gespeichert werden. Ein technisch gültiger Code allein beweist keine Identität.
- Codes mit besonders auffälligem Null-Präfix lösen nicht sofort eine externe API-Abfrage aus. Diese erfolgt erst nach Bestätigung.
- Es wird kein ungeklärter Barcode automatisch zu Argileh ORNG MNT hinzugefügt. Quellenbelege bleiben die Voraussetzung für den öffentlichen Katalog.

Grenzen: Die Prüfung der Formate kann ohne Metadaten beim Fotoimport nur anhand der Länge erfolgen. Ein wiederholt falsch gelesener EAN-13-Code ist weiterhin möglich; der Abgleich mit den Verpackungsziffern ist die verlässliche Kontrolle.

### EAN-Korrektur ohne Datenverlust

Im Tabak-Editor lassen sich die zugeordneten Barcodes jetzt direkt bearbeiten (Komma-getrennt). Ein falscher Scan kann entfernt oder korrigiert werden, **ohne den Tabak oder dessen Sessions zu löschen**. Auch der JSON-Import prüft nun die GTIN-Prüfziffer und blockiert doppelte EAN-Zuordnungen über verschiedene Tabake hinweg. 12-stellige UPC-A-Codes werden auf ihre 13-stellige EAN-Entsprechung normalisiert.

## Kameralicht, Scharfstellen und Zoom

Nach dem Start der Handykamera prüft der Scanner deren tatsächlich gemeldete Funktionen. Nur unterstützte Bedienelemente werden angezeigt:

- **Licht ein/aus:** Steuerung der rückseitigen LED über `torchFeature()`, alternativ `applyVideoConstraints()`.
- **Scharfstellen:** Autofokus-Anforderung über `focusMode: "continuous"` oder `"single-shot"`, sofern vom Kameratreiber gemeldet.
- **Manueller Fokus:** Entfernungsschieberegler, wenn `focusMode: "manual"` zusammen mit `focusDistance` verfügbar ist.
- **Kamerazoom:** Stufenloser Regler innerhalb des vom Gerät gemeldeten Bereichs.

Nicht jeder Browser erlaubt diese Einstellungen, besonders bei iOS unterscheiden sich die verfügbaren Funktionen. Ist keine Funktion verfügbar, erscheint nur ein erklärender Hinweis. Start, Stop, Schließen und Seitenwechsel setzen die Regler zurück und geben den Kamerastream frei. Das Licht wird mit dem Stoppen des Streams ausgeschaltet. Es wird kein Kamerabild übertragen.

Technische Grundlagen: [html5-qrcode CameraCapabilities](https://scanapp.org/html5-qrcode-docs/docs/apis/classes/Html5Qrcode), [MDN MediaStreamTrack.getCapabilities](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities).

## Breiter Quellenimport (November 2026)

Zusätzlich zum Einzelproduktimport verarbeitet `scripts/import_listings.py` öffentliche **Produktübersichtsseiten** von Blubberhaus, Shisha-Shop.de, Mall of Shisha und SUN-VI. Die GTIN wird nur übernommen, wenn sie zusammen mit einem eindeutig benannten Produkt in derselben Produktkarte steht. Wenn mehrere Produktkarten oder Barcodes vermischt sind, wird der Treffer verworfen. `robots.txt`, Abrufgrenzen und Wartezeiten bleiben aktiviert. Der automatisierte Shisha-Nil-Import ist von 55 auf maximal 300 geprüfte Einzelproduktseiten je Lauf erweitert. Ergebnisse jeder Quelle stehen getrennt unter `catalog/import-report.json` und `catalog/listing-import-report.json`. Die Aufnahme neuer Datensätze erfolgt weiterhin erst nach Prüfung des Import-Branches.

### Erweiterung auf weitere Einzelproduktkataloge

Der Einzelprodukt-Importer liest jetzt außerdem **Turaah, Blubberhaus und Shisha-Shop.de** über öffentliche Detailseiten aus, sofern der jeweilige Zugriff durch robots.txt erlaubt ist. Für Turaah sind bis zu 230, für Blubberhaus und Shisha-Shop.de jeweils bis zu 190 geprüfte Produktseiten pro Lauf vorgesehen. Produktseiten mit widersprüchlichen oder mehreren nicht zuordenbaren GTINs werden weiterhin ausgeschlossen. Die Sitemap-Auswertung wurde erweitert. Die Begrenzungen verhindern unkontrolliertes Voll-Crawling.

## Aktueller EAN-Katalog (17.11.2026)

**655 eindeutige, quellverknüpfte EAN/GTIN-Einträge**; zusätzliche Daten stammen insbesondere aus Turaah und dem offiziellen niederländischen RIVM-EU-CEG-Produktregister. Die Registrierungsdaten für NL sind nicht automatisch ein Nachweis deutscher Marktverfügbarkeit. Die EAN-Red-Team-Prüfung und ihre Grenzen sind im [Qualitätsbericht](docs/red-team-2026-11-17.md) dokumentiert. Fehlende Sorten- und Geschmacksinformationen werden nicht erfunden.
