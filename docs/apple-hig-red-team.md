# Apple-HIG-Red-Team: Tabakjournal (18.11.2026)

## Gegenstand und Einordnung

**Plattform:** statische, lokal speichernde Webapp für Smartphone und Desktop (GitHub Pages, HTML/CSS/JavaScript), keine native iOS- oder macOS-App.

**Designthese:** Ein unaufdringliches, privates Inventar mit persönlichem Session-Journal. Die **eigene Sammlung** und die **Packungsanzahl** stehen im Mittelpunkt; Markenwirkung entsteht durch Ordnung und direkt manipulierbaren Bestand, nicht durch generische Verlaufskarten oder dekoratives „Glas“.

**Methode:** Code-basierter Red-Team-Audit gegen [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill), einschließlich dessen HIG-Referenzen. Regeln für native Komponenten werden auf Webstandards übertragen; `<dialog>`, `<nav>` und die Browser-Eingabefelder ersetzen keine Apple-Systemkomponenten. **Keine native Apple-HIG-Zertifizierung.** Kontrastwerte sind aus den CSS-Hex-Farben berechnet (WCAG-Kontrastalgorithmus); finale visuelle und assistive Gerätetests bleiben zusätzlich erforderlich.

## Befunde und direkte Korrekturen

| Priorität | Vorher / Risiko | Apple-HIG-Referenz | Korrektur |
| --- | --- | --- | --- |
| **Critical** | Dark-Mode-Primärbutton: weiße Schrift auf hellblauem Hover-Hintergrund = **1,64:1**, unleserlich | `accessibility.md › Vision`; `color.md › Best practices` | Hover im Dark Mode `#1653AA` mit Weiß = **7,36:1** |
| **High** | Mobile horizontale Navigation am oberen Rand, unübersichtlich und fern der Daumenreichweite | `tab-bars.md › Best practices`; `layout.md › Adaptability` | Fünf feste Tabs unten, kompakte Labels, safe-area-aware; Seitenleiste bleibt Desktop-Navigation |
| **High** | Viele sehr kleine Icons/Touch-Ziele und kleingedruckte Metadaten | `accessibility.md › Vision`; `buttons.md › Best practices` | Berührbare Elemente mobil mindestens 44 px, Beschriftungen größer, klarer Tastaturfokus |
| **High** | Alte Oberfläche nur hell / dunkle Seitenleiste unabhängig von Systemdarstellung | `dark-mode.md › Best practices`; `color.md › System colors` | Semantische Token mit `prefers-color-scheme` für alle Flächen und Zustände |
| **High** | Inkonsistente Symbolzeichen (✎, ▤, ◷) und werblicher Hero lenken vom eigenen Inventar ab | `design-principles.md › Simplicity`; `typography.md › Conveying hierarchy` | Zusammenhängende lokale SVG-Symbolfamilie, deutlich vereinfachte Startansicht |
| **Medium** | Ganze Hauptansicht war `aria-live`; ständiges Neuansagen bei Navigation | `accessibility.md › Vision`; `feedback.md › Best practices` | Fokus auf Hauptinhalt nach Navigation, `aria-current="page"`, separate Statusmeldung statt Live-Region des kompletten Screens |
| **Medium** | Dialoge konnten ungespeicherte Formularwerte beim Escape oder Klick auf den Hintergrund verwerfen | `modality.md › Best practices`; `sheets.md › Best practices` | Änderungserkennung und konkrete Verwerfensbestätigung; Speicherung schließt ohne irreführende Nachfrage |
| **Medium** | Visueller Sheet-Grabber täuschte Ziehfunktion vor | `sheets.md › Platform considerations` | Fake-Grabber entfernt; normales responsives `<dialog>` statt falsch simuliertem native Sheet |
| **Medium** | Zusätzliche dekorative Farbverläufe und viele uneinheitliche Farbakzente | `liquid-glass.md › The two layers`; `layout.md › Visual hierarchy` | Solide Inhaltskarten; Transparenz ausschließlich auf Navigation und Werkzeugleiste, mit Reduce-Transparency-Fallback |
| **Medium** | Doppelte Bestätigung für „Alle Daten löschen“ ohne zusätzlichen Erkenntnisgewinn | `feedback.md › Best practices`; `design-principles.md › Agency` | Eine aussagekräftige, vor der Löschung angezeigte Bestätigung mit Zahl der betroffenen Einträge |
| **Medium** | Fixierte Mindestbreite 320 px riskierte horizontales Scrollen bei hohem Browserzoom | `layout.md › Adaptability`; `accessibility.md › Vision` | Mindestbreite entfernt und zusätzlicher Layout-Fallback für sehr schmale Breiten |
| **Low** | Erfolgs- und Fehlerhinweise nur über kleine Elemente | `feedback.md › Best practices` | Texte ergänzen Statusfarbe, Toasts werden per Statusrolle angekündigt; Systemreduzierung von Bewegung berücksichtigt |

## Farb- und Typografiesystem

| Rolle | Hell | Dunkel | Ergebnis |
| --- | --- | --- | --- |
| Hintergrund | `#F5F5F7` | `#111214` | dezente, neutrale Leinwand |
| Inhaltsfläche | `#FFFFFF` | `#1C1C1F` | solid, nicht verglast |
| Primärtext | `#1D1D1F` | `#F5F5F7` | **16,83:1** hell; **15,61:1** dunkel |
| Sekundärtext | `#51525B` | `#C0C0CA` | **7,76:1** hell; **9,42:1** dunkel auf Inhaltsflächen |
| Akzentlink | `#005FCC` | `#7FB7FF` | **5,98:1** hell; **8,19:1** dunkel |
| Primärbutton | `#005FCC` | `#1B5DB9` | Weiß **5,98:1** hell; **6,34:1** dunkel |
| Primärbutton Hover | `#004AAB` | `#1653AA` | Weiß **8,18:1** hell; **7,36:1** dunkel |
| Erfolg | `#216A48` / `#E7F6EC` | `#90D8AA` / `#183B29` | **5,84:1** hell; **7,42:1** dunkel |
| Warnung | `#7A4F11` / `#FFF1D9` | `#F0C882` / `#41321D` | **6,38:1** hell; **7,82:1** dunkel |
| Gefahr | `#B42318` / `#FCEBE9` | `#FF9C93` / `#482420` | **5,70:1** hell; **6,73:1** dunkel |

Primärschrift: Plattform-Systemschrift (`-apple-system` als erste Wahl, standardisierte Fallbacks). Body-Grundgröße 16 px Desktop und 17 px Mobil. Überschriften sind groß und klar, Metadaten nachrangig. Schmale Layouts und Browserzoom müssen die Inhaltsstruktur erhalten.

## Struktur, Interaktion, Verzicht

Desktop:

```
┌────────────────────┬─────────────────────────────────────────────┐
│ Tabakjournal       │ Toolbar: Bereich | Scanner | Erfassen       │
│ Übersicht          ├─────────────────────────────────────────────┤
│ Meine Tabake       │ Titel / Zweck / unmittelbare Aktion         │
│ Sessions           │ Inhalt: Bestand, Sessions, Auswertung       │
│ Auswertung         │ Filter / Karten / Zeilen                    │
│ Daten & Backup     │                                             │
└────────────────────┴─────────────────────────────────────────────┘
```

Smartphone:

```
┌───────────────────────────────────┐
│ Bereich             Scan  Erfassen│
├───────────────────────────────────┤
│ Titel / Suche / Inhalte           │
│ Bestand mit ± direkt korrigieren  │
│                                   │
├───────────────────────────────────┤
│ Start | Tabake | Sessions |       │
│ Analyse | Daten                   │
└───────────────────────────────────┘
```

**Signatur:** Die persönliche Tabaksammlung mit direkt änderbarer Packungsanzahl, nicht eine künstliche Dashboard-Illustration. Keine animierten Übergänge, die für die Bedienung erforderlich wären. Übergänge sind zurückhaltend und entfallen bei `prefers-reduced-motion`.

**Bewusst entfernt:** wiederholtes Brand-Kürzel im Hero und aufdringliche gradient-basierte Markenflächen. Eigene Tabake bleiben unabhängig vom recherchierten Produktkatalog; der neue Entwurf verändert weder Datenbankschema noch Inhalt der persönlichen Sammlung.

## Qualitätssicherung

- `tests/hig-gui.test.mjs`: WCAG-Kontrastberechnung in beiden Erscheinungsbildern, alle fünf Navigationsziele, aktuelle Seite, Skip-Link, Touch-Flächen, Safe Areas, Fokus, Reduced Motion/Transparency, korrekte Materialschichten und Dialogschutz.
- `tests/smoke.test.mjs`, `tests/inventory.test.mjs`, `tests/catalog.test.mjs`: Schutz der vorhandenen Funktionen und Daten.
- GitHub Actions: `node --check app.js`, Katalog- und Exporter-Prüfungen sowie `node --test tests/*.test.mjs`.
- **Manuelle Folgeprüfung erforderlich:** VoiceOver/NVDA, Safari iOS mit Dynamic Type, 200%-Browserzoom, Tastatur und Softkeyboard, Screenshotvergleich 320/375/768/1024/1440 px, Touch-Interaktion und echte Barcode-Kamera.

## Web-Plattformgrenzen

Die App verwendet `<dialog>`, CSS-Mediaqueries und eigene SVG-Icons. Sie kann native iOS-Detents, System-SF-Symbol-Effekte oder macOS-Menüleisten nicht vollständig bereitstellen. Eine künstliche Darstellung solcher Funktionen wäre irreführend. Die Apple-HIG-Richtlinien werden als Design- und Zugänglichkeitsmaßstab umgesetzt, nicht als Behauptung einer nativen Apple-App.
