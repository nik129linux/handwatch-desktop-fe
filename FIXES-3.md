# FIXES round 3 (after the design pass): small, keep acceptance green, keep the look.

1. The open Retoma panel covers the 4th dock icon (shot-1440-resume.png). Dock must stay fully visible: panel
   bottom <= dock top - 12px (reduce panel max-height accordingly, tab body scrolls).
2. Numbers disagree: legend says Documento 43 min, proposal says 40 min ("bloque mayor"). The proposal must say
   the real longest uninterrupted block (and the legend must label that block distinctly, e.g. "bloque mayor 40 min"
   as a sub-line), no unexplained mismatch.
3. Proposal times 8:52-9:32 look arbitrary. Round the proposed window start to the nearest 15 minutes (9:00-9:40)
   and keep the "Cómo lo decidí" line consistent with the rounded numbers.
4. Simulator buttons: all-caps mono 11px text is hard to read and to hit. Use sentence case mono 12px (letter-
   spacing .04em, NOT caps), min hit height 40px, a visible hover underline in primary and :focus-visible ring;
   put "Turno guiado" as one clear primary pill again (it is the entry point), Pausar/Saltar/Reiniciar as its
   secondary controls on one row. Keep tracked-caps only for the 3-4 group titles.
5. The wallpaper's dark green glow reads muddy. Tint it from the primary token via color-mix at <= 12% over
   neutral-950 so it follows the color-change test, and make sure nothing keeps rgb(166,255,0) when primary changes.

Re-run tests (add assertions for 1, 2, 4: hit height >= 40, dock rect not intersecting panel rect), screenshots
at 1440 and 390, LOOK at them. Commit "desktop: polish". Report in <= 5 lines.
