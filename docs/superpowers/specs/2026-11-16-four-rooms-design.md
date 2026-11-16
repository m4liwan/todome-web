# Vier Räume für „Heute“ — Design (freigegeben 2026-11-16)

## Warum
Durch das Umschalten soll der Nutzer ein neues mentales Gefühl und einen frischen Fokus bekommen.
Die Hauptkarte (aktueller Schritt bzw. „Was wäre heute ein guter erster Schritt?“) bleibt in jedem Raum das Zentrum.
Der Begleiter ist überall präsent, an einem eigenen, architektonisch begründeten Platz.

## Gesetze
- #050505, keine Boxen; Trennung nur über Haarlinien (`--line`) und Raum; Ecken über `--radius`.
- Logik, IPC und Datenstrukturen bleiben unverändert. Einzige Datenänderung: `appearance.layout` kommt zurück (`classic | sanctuary | hub | flow`, Standard `classic`). Unbekannte Werte fallen auf `classic` zurück.
- Alle vier Räume sind frei (kein Pro).

## Räume
1. **Classic / Monolith:** Der heutige Aufbau, geschärft.
   - Die Hauptkarte steht links (8/12).
   - Rechte Spalte: Begleiter, Wasser, Danach.
   - Unten: Tagesverlauf, Tages-Anker, Mehr.
2. **Sanctuary / Zen:** Eine schmale Mittelspalte; der Gruß ist leise, die Tageszahlen sind ausgeblendet.
   - Der Begleiter ist eine einzeilige „flüsternde“ Präsenz direkt unter der Hauptkarte.
   - Alles andere liegt eingeklappt hinter „Wenn du magst“ (öffnet sich auch für die Tour).
   - Das Licht ist ruhiger und zentriert.
3. **Hub / Command:** Der Tagesverlauf steht direkt unter dem Gruß.
   - Die Hauptkarte steht links (7/12).
   - Rechts ist der Kommandoraum: Begleiter, Wasser und Zeiten heute, darunter die Tages-Anker.
   - „Zeiten heute“ verlässt dafür „Dein Rhythmus“.
4. **Flow / Stream:** Der Tagesverlauf steht oben.
   - Darunter liegt die Lesebahn Hauptkarte → Danach → Begleiter-Strom (Begleiter und Wasser), mit Fluss-Markern auf den Haarlinien.
   - Der Strom bleibt beim Scrollen in Sicht.

## Verhalten
- **Wechsel:** Der Raum baut sich neu auf; die Module treten gestaffelt ein, und jeder Raum hat ein eigenes Lichtprofil.
- **Umschalter:** Vier Raum-Symbole sitzen leise im Kopf von „Heute“. Dazu gibt es Vorschau-Karten unter Einstellungen → Design.
- **Schmale Fenster:** Unter 1180px gibt es eine Spalte in Priorität: Gruß, Hauptkarte, dann der Rest.
- **Fokus-Stile:** `fs-*` greifen weiter über die gemeinsamen Bereichsklassen.
