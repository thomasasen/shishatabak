# Tabakjournal

Ein schlanker, privater Pilot für die Verwaltung von Shisha-Tabaken und die Dokumentation von Geschmack und Beschwerden. Ausgelegt auf **NOCCA eHMD ohne Kohle**.

## GitHub Pages

Die Anwendung ist **rein statisch**: kein Build, kein Server, keine externen Skripte. Alle für GitHub Pages benötigten Dateien liegen direkt im Root des Branches **main**.

**Einmalige Aktivierung:** GitHub → Repository → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: /(root) → Save**.

Danach ist die erwartete URL: https://thomasasen.github.io/shishatabak/

> Der Commit allein aktiviert GitHub Pages nicht. Ob die Pages-Einstellung im Repository gesetzt ist, muss in den Settings kontrolliert werden.

## Was der Pilot bereits kann

- Hersteller-/Sorten-Autovervollständigung aus einem **recherchierten lokalen Produktkatalog** mit exemplarischen, öffentlich dokumentierten Produkten; zusätzlich Herstellervorschläge und freie Eingabe.
- Tabake anlegen, bearbeiten und löschen (Hersteller, Sorte, Grundtabak, Geschmack, Notizen).
- Sessions erfassen, bearbeiten und löschen: Datum, Tabak, Geschmack (1–5), Beschwerden (0–3), Symptome, Dauer, NOCCA-Temperatur und Kopf.
- Übersicht und Auswertungen nach Grundtabak und Hersteller mit sichtbarer Fallzahl.
- Dauerhafte Speicherung über **localStorage** im selben Browser, auch nach Browserneustart.
- JSON-Export und validierter JSON-Import als **Zusammenführen** oder **Ersetzen**. Einträge sind mit IDs verknüpft; beim Zusammenführen werden doppelte Produkte anhand von Hersteller und Sorte erkannt.
- Responsive Darstellung für Desktop und Smartphone.

## Wichtige Grenzen

- **Keine vollständige Shisha-Datenbank:** Die Vorschläge sind ein kuratierter Offline-Produktkatalog, keine laufend synchronisierte Händler-/Hersteller-API. Produktattribute können sich ändern und sollten überprüft werden.
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

## Recherchebasierte EAN-Datenbank und Scanner (v0.2)

Die Datenbank befindet sich unter [catalog/products.json](catalog/products.json). Sie enthält **107 recherchierte Produktvarianten** aus **18 Marken bzw. Produktlinien** mit EAN/GTIN, Packungsgröße, Quellenlink und Prüfdatum. Die Datei [catalog.js](catalog.js) wird daraus für die statische Webapp erzeugt. Prüfskript: `node scripts/build-catalog.mjs --check`.

Oben **Barcode scannen** wählen und die Handykamera auf den Strichcode richten. Alternativ Foto oder manuelle EAN-Eingabe. Der Scanner erkennt EAN-13, EAN-8 und UPC-A. Ein gefundener Tabak lässt sich direkt der Sammlung hinzufügen. Unbekannte EANs können einmalig einem neuen oder vorhandenen Tabak zugeordnet werden. Diese Zuordnungen bleiben lokal gespeichert und werden mit dem bestehenden JSON-Backup exportiert/importiert.

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
