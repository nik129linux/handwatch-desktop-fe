# FIXES round 2: verified by screenshots (shots/shot-1440-resume.png, shot-390-resume.png). Keep acceptance green.

1. **The Documento window is invisible at 1440** (hidden under the Retoma panel) and Navegador/Datos are cut by it.
   The windows must live entirely in the region LEFT of the open panel (x from 0 to panel-left minus 24px) and
   must not overlap each other or the panel at 1440x900 with the panel open. The reopen animation after
   "Retomar" must be visible: Documento, Navegador, Hoja de cálculo appear staggered 60ms in that left region.
   Add an assertion: with the panel open, every visible window's bounding rect has right <= panel left.
2. **At 390px the desktop area is an empty void** above the panel. Under 900px show the windows as a compact
   stacked list of 4 small window cards (title + app name, focused one with the lime hairline ring) between the
   menu bar and the Retoma sheet; no overlap, no horizontal scroll.
3. **Resume-card kicker wraps badly**: "TE INTERRUMPIÓ: WHATSAPP · 25 MIN" in uppercase tracked breaks onto a
   second line. Render it as normal-case 14px Fog text on one line ("Te interrumpió WhatsApp · 25 min"); keep
   the tracked uppercase label tier only for short kickers (RETOMA, AHORA, HOY).
4. **Proposal card's buttons are cut off at the bottom of the panel in the Hoy tab** (Aceptar half visible).
   Make the tab body scroll inside the panel with 24px bottom padding so both buttons are fully visible and
   reachable; add an assertion that Aceptar's rect is inside the viewport after scrollIntoView.
5. **Timeline legend lists "Documento" twice** (40 min and 1 min). Merge same-app segments in the legend
   (sum minutes), keep the bar segments.

Screenshots at 1440 and 390 again (load, resume with panel open, after Retomar, timeline) into shots/ and LOOK
at them. Tokens/voseo rules unchanged. Commit "desktop: fixes round 2". Report in <= 6 lines.
