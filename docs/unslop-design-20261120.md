# Unslop-Designprüfung · 20.11.2026

## Richtung (vom Produkt abgeleitet)

- **Produkt:** Privates Tabakjournal für persönliche Verträglichkeits- und Geschmacksbewertungen.
- **Charakter:** Präzise, sachlich, etwas warm.
- **Welt:** Ein benutztes Tabakjournal; Graphit und Papier statt Neon und Glas.
- **Momente:** Die fünf originalen Shisha-Markierungen tragen die Bewertung, die vorhandenen Beschwerdeillustrationen sind die einzige weitere bildhafte Ebene.
- **Signatur:** Eine kompakte Fünferbewertung, die sich mit dezenten semantischen Farben von den übrigen Daten abhebt.

## Befund am bisherigen Stand

1. Die Designhistorie bestand aus mehreren aufeinanderfolgenden, widersprüchlichen CSS-Überschreibungen. Alte Riesenheader, große Zierkacheln, Gradientflächen und Größenkorrekturen blieben als schwer nachvollziehbarer Cascade-Ballast erhalten.
2. Die violetten Verläufe, Leuchtränder und eingefärbten Hintergründe konkurrierten mit den eigentlichen Bewertungen.
3. Die Schriftgewichte bis 790, die wechselnden Pill-Radien und zu großen Beschwerdekacheln erzeugten einen uneinheitlichen visuellen Takt.
4. Suche, Filter, Tabakreihe und Dialog hatten unterschiedliche Größenlogiken; mehrere Ansichten verwendeten unterschiedliche Kartenarten.
5. Positiv und zu bewahren: Lokale Datenhaltung, bewährte einspaltige Desktop-Tabakzeilen, zugänglicher Editor, responsives Layout, selbst gestaltetes Logo, original freigegebene Beschwerden und die fünf Shisha-Symbole.

## Umsetzung in neun Durchgängen

1. **Abstände:** 4-px-Raster; 8/12/16/20/24/32 px als wiederkehrende Werte; 44-px-Touch-Ziele.
2. **Farbe:** Warme neutrale Dunkel-/Hellpaletten; genau ein heller bzw. erdiger Akzent; Ratings behalten nur notwendige semantische Farben. Keine Farbverläufe, radialen Washes oder Glows.
3. **Ikonografie:** Bereits vorhandene konsistente SVG-Navigation und die vom Projekt freigegebenen Shisha- und Beschwerdeillustrationen beibehalten; keine Emojis.
4. **Text:** Kürzere, produktspezifische Such- und Seitenbeschriftungen ohne Werbesprache.
5. **Typografie:** Systemschrift ohne externen Font-Request; Grundgewichte 400/500, 600 nur für Wortmarke; kleinere, klarere Hierarchie.
6. **Layout:** Tabakzeilen auf breiten Bildschirmen in einer Reihe, auf kleineren in zwei lesbaren Gruppen; keine künstlich schmale App-Spalte.
7. **Details:** Einheitliche Radien (9 px Bedienelemente; 12–14 px Karten/Panele); neutrale Haarlinien; keine geschmückten Bewertungs-Pills; separate Zählwerte bleiben lesbar.
8. **Visuals:** Keine generierten Füllbilder; vorhandene eigene Symbole sind die konkreten Produktsignaturen.
9. **Bewegung:** Nur kurze gezielte Farb- und Zustandswechsel, Rücksicht auf reduzierte Bewegung und reduzierte Transparenz.

## Architektur und Rückwärtskompatibilität

`styles.css` bleibt das funktionale Stylesheet mit den älteren Barrierefreiheitsregeln. Die sechs historischen Visual-Mockup-/Override-Passagen ab `VISUAL FIDELITY` wurden entfernt. `design.css` legt die konkrete neue Gestaltung kontrolliert darüber, und `index.html` lädt die beiden Dateien in dieser Reihenfolge mit geändertem Cache-Key. Geschäftslogik, Speicherformat, Export und Import sind unverändert. `app.js` enthält ausschließlich Kürzungen am UI-Text.

## Prüfpunkte

- Automatisiert: Node-Syntax, bestehende Boot-/Smoke-/HIG-/Katalogtests und neue CSS-Kontrast- und Erhaltungstests
- Manuell im Browser zu prüfen: hell/dunkel, Breiten 320/375/680/820/1100/1440 px, lange Sortennamen, fünf Beschwerden, nicht bewertet, Editordialog, Tastaturfokus, lokale Datenerhaltung
- Kein Screenshotvergleich ist durch diesen Bericht behauptet; hierfür ist ein echter Browser-Render nötig

## Herkunft und Lizenz

Gestaltungsverfahren nach **Unslop** von **Damir Sokolovsky**: https://github.com/heydamir/unslop, lizenziert unter **CC BY 4.0**. Die Gestaltung hier ist eigenständig auf das Tabakjournal übertragen, nicht aus dem Referenzdesign kopiert.
