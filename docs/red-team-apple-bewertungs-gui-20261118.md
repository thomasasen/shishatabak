# Apple Design Skill – Red-Team-Nachprüfung der Bewertungsoberfläche

**Stand:** 18. November 2026 · **Repository:** `thomasasen/shishatabak` · **Gegenstand:** aktuelle statische Bewertungs-Webapp, **nicht** das frühere Session-Tagebuch.

## Kontext und Prüfungsgrenzen

**Plattform:** responsive HTML/CSS/JavaScript-Webapp, GitHub Pages, Desktop und Smartphone. Die Apple Human Interface Guidelines sind der Maßstab für zugängliche, klare und kontextsensitive Webgestaltung. Die App verwendet keine nativen iOS-/macOS-Komponenten und beansprucht keine native HIG-Konformität.

**These:** Die Oberfläche soll sich wie ein fokussiertes persönliches Nachschlagewerk anfühlen: **pro Tabaksorte eine sofort erkennbare Verträglichkeitsnote**, ohne Ablenkung durch Sessions, Dashboards, Scanner oder umfangreiche Bestandsfunktionen.

**Zwei Red-Team-Perspektiven:**

1. **Accessibility- und Plattform-Team:** Findet Verstöße gegen Lesbarkeit, Interaktionsgrößen, Navigation, Semantik, Dialoge und Eingabezuverlässigkeit.
2. **Produkt- und Design-Team:** Prüft Aufgabenfokus, visuelle Priorität, überflüssige Schritte, Bildschirmökonomie und UI-Texte.

**Grundlage – tatsächlich geprüfte Skill-Dateien:** `dickwu/apple-design-skill/SKILL.md` sowie die HIG-Referenzen `accessibility.md`, `layout.md`, `typography.md`, `color.md`, `designing-for-ios.md`, `cross-platform.md`, `design-principles.md`, `tab-bars.md`, `sidebars.md`, `buttons.md`, `text-fields.md`, `entering-data.md`, `searching.md`, `modality.md`, `sheets.md`, `feedback.md`, `writing.md`, `dark-mode.md`, `liquid-glass.md`, `rating-indicators.md` und `ratings-and-reviews.md`.

**Abgrenzung:** `ratings-and-reviews.md` regelt Bewertungen von Apps im App Store, *nicht* die Bewertung eines Tabakprodukts. `rating-indicators.md` beschreibt ein macOS-Status-Steuerelement; dessen Prinzip der gut erkennbaren Bewertung ist übertragbar, nicht jedoch eine Pflicht zu nativen Sternsymbolen.

## Befunde und Korrekturen

| Priorität | Red-Team-Befund im vorherigen Code | Referenzdatei / Abschnitt | Korrektur |
| --- | --- | --- | --- |
| **Hoch** | „Backup“ stand als zweite, gleichberechtigte Hauptnavigation in einer permanenten Smartphone-Tabbar. Backup ist ein Hilfswerkzeug, kein zweites Hauptprodukt. | `design-principles.md › Simplicity`; `tab-bars.md › Best practices` | Ein inhaltszentrierter Hauptbereich; Backup jetzt als sekundäre Aktion in der Werkzeugleiste. Mobile Tabbar und Desktop-Sidebar entfallen. |
| **Hoch** | Unter 420 px zerfiel die 5-Punkte-Verträglichkeitsskala in **3 + 2** Felder. So wird eine lineare Skala visuell zu zwei Gruppen. | `layout.md › Adaptability`; `accessibility.md › Vision` | Fünf gleichwertige numerische Ziele in **einer Zeile** mit mindestens 44 px Breite; bei extrem schmalem Platz seitlich scrollbar, statt Umbruch. Alle Werte haben zugängliche Bezeichnungen. |
| **Hoch** | Jeder Tastendruck in der Suche ersetzte die ganze Inhaltsansicht mit `innerHTML`. Das konnte Fokus, Auswahl und mobile Bildschirmtastatur stören. | `entering-data.md › Best practices`; `searching.md › Best practices` | Nur Trefferbereich und Trefferanzahl werden aktualisiert; Eingabefeld und Fokus bleiben unverändert. |
| **Mittel** | Zwei prominente Schaltflächen zum Hinzufügen im gleichen Bildschirm und überbreite Seitenleiste im Einzweck-Produkt. | `design-principles.md › Simplicity`; `layout.md › Visual hierarchy` | Eine zentrale Hinzufügen-Aktion in der Toolbar; zusätzlicher CTA nur beim leeren Erstzustand. |
| **Mittel** | Verträglichkeit ging in Produktmetadaten, mehrfachen Auswahlfeldern und langen Formularabschnitten unter. | `writing.md › Best practices`; `entering-data.md › Best practices` | Reihenfolge: Produktidentität → **Verträglichkeit 1–5** → aufklappbare Zusatzangaben; Pflichtaufgabe steht sofort im Fokus. |
| **Mittel** | Auf kleinen Mobilansichten waren die Speicher- und Abbrechen-Schaltflächen häufig nur nach langem Scrollen sichtbar. | `modality.md › Best practices`; `sheets.md › Best practices` | Im scrollbaren HTML-`<dialog>` haftende Aktionsleiste mit Safe-Area-Abstand; zwei klar benannte Aktionen. |
| **Mittel** | Nach Auswahl einer Skalenstufe wurde ihre verbale Bedeutung außerhalb der fünf Bedienelemente nicht bestätigt. | `feedback.md › Best practices`; `accessibility.md › Vision` | Dynamische Klartext-Rückmeldung: „Ausgewählt: 4 von 5 · Gut“; Screenreader erhalten zusätzlich die vollständige Stufenbezeichnung. |
| **Mittel** | Produkttreffer wurden im Dialog nur visuell ergänzt, ohne mitzuteilen, wie viele Vorschläge vorliegen. | `searching.md › Best practices`; `accessibility.md › Vision` | Statusregion meldet Anzahl der lokalen Vorschläge und erklärt die Tastaturauswahl; bei null Treffern wird die manuelle Eingabe ausdrücklich erlaubt. |
| **Niedrig** | Browser-Autofill für „Organisation“ konnte einen falschen Herstellernamen eintragen. | `entering-data.md › Best practices` | Sachfremde Organisations-Autovervollständigung entfernt; produktbezogene eigene Katalogvorschläge bleiben. |
| **Niedrig** | Viel CSS stammte noch von Sessionkarten, Dashboards, Bestandssteuerung und früheren Navigationen. | `design-principles.md › Craft` | Stylesheet gezielt auf aktuelle Bewertungen, Suche, Backup und Dialoge reduziert; semantische Farbwerte beibehalten. |

## Visuelle Regeln

- **Signatur:** die groß gesetzte persönliche Verträglichkeitszahl und ihre ausgeschriebene Bedeutung auf jeder Produktkarte. Grün/Rot/Neutral unterstützen die Orientierung, sind aber nie die einzige Aussage.
- **Primäre Aktion:** „Tabak hinzufügen“ in der Leiste. **Sekundär:** „Backup“. **Pro Eintrag:** „Bewertung bearbeiten“ oder „Jetzt bewerten“.
- **Datenhaltung:** keine Änderung des bestehenden `tabakjournal:v1`-Formats. Frühere Tabake und archivierte Sessiondaten bleiben erhalten; keine stillen Ableitungen einer Gesamtnote.
- **Systemdarstellung:** Light/Dark-Tokens aus dem bisherigen Design mit überprüften Textkontrasten. Blur nur an der funktionalen oberen Leiste, niemals auf Karten.
- **Motion und Zugänglichkeit:** sichtbarer Tastaturfokus, Native-Radio-Inputs, HTML-`<details>`, `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast` und Forced Colors.

## Automatisierte Regressionstests

`tests/hig-gui.test.mjs` kontrolliert semantische Kontraste in hell/dunkel, die neue Navigation, mobile 44-px-Ziele, fünf gleichwertige Werte, einen angehefteten Dialogabschluss, zugängliche Statusmeldungen und die Trennung von Inhalt und Transparenz.

`tests/review.test.mjs` kontrolliert Produktvorschläge, die Bewertungsreihenfolge, Packungsvarianten und ältere Daten; `tests/smoke.test.mjs` sichert darüber hinaus die **stabile Suche ohne Fokusverlust durch vollständigen DOM-Neuaufbau** ab. Die übrigen Katalog-, Syntax- und Importtests bleiben erhalten.

## Noch manuell zu prüfen

Diese Überprüfung ist **codebasiert**. Es liegt kein vollständiger Test mit echtem iPhone, VoiceOver, macOS VoiceOver/NVDA, Bildschirmtastatur oder visuellen Screenshots aus Safari vor. Vor einer Aussage über tatsächliche native HIG-Konformität müssten mindestens folgende reale Geräteprüfungen stattfinden: Safari bei 320/375/430 px, 200 % Schriftvergrößerung und Browserzoom, Hoch-/Querformat, geöffnetes Softkeyboard, Dialogscrolling mit fixierter Aktionsleiste, VoiceOver-Radiogruppen, Dark Mode mit erhöhtem Kontrast und reduzierte Transparenz. Die Apple-Skill-Dateien sind hier **Prüfmaßstab**, kein Nachweis einer Apple-Zertifizierung.
