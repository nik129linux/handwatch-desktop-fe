# BRIEF: "Retoma", desktop companion prototype (Stryds style, third surface of the final project)

You are the frontend builder. Build a static, no-build prototype in THIS folder. Frontend quality is the #1
grading criterion. Read `ref/` first: `DESIGN.md`, `variables.css`, `tokens.json` (Stryds), and
`../smartwatch/BRIEF.md` + `../smartwatch/css/tokens.css` + `../smartwatch/js/story.js` as the pattern to follow
(same token rules, story/free-mode structure, Playwright acceptance). Do not edit anything outside this folder.

## The product (one paragraph)
Retoma watches which APP/WINDOW is in focus on the desktop (titles only: never keystrokes, never screen
content), notices interruptions, and when you come back shows a **resume card**: what you were doing, the
windows that were open, one click to reopen them. End of day it shows an honest timeline (what you planned vs
what happened) and the AI proposes ONE focus block for tomorrow. The AI only summarizes and proposes; it never
acts without a tap. Design problem (same family as the watch case): an app that watches your usage reads as
spyware, so the interface must earn trust: a "Qué ve / Qué nunca ve" panel, a visible pause control that is
always on screen, everything stays on this device, delete everything in one gesture, and wording about the
person's own work, never about "productivity score" or being "distracted".

## Deliverables (only these)
```
index.html           stage: simulated desktop + Retoma + story/free-mode panel
css/tokens.css       THE ONLY file with raw color values
css/desk.css         simulated desktop (menu bar, dock, windows), motion
css/retoma.css       Retoma panel, resume card, timeline, privacy panel
js/events.js         event bus + demo data (focus events, apps, timestamps)
js/desk.js           simulated windows: focus, minimize, reopen
js/retoma.js         tracker logic, resume-card builder, timeline, "AI" proposals (canned, deterministic)
js/story.js          guided script + free-mode controls
tests/acceptance.js  Playwright acceptance
```
Vanilla HTML/CSS/JS, plain `<script>` tags, opens by double-click (file://). Google Fonts `<link>` allowed.
Fonts: Inter Tight 600 display, Inter 400/500 body. UI copy Spanish neutral Colombian, "tú", no voseo
(tocá/mirá/podés/tenés/querés/acordate are WRONG). Code, comments, identifiers in English.

## Tokens (the professor WILL test this)
Same rule as the watch: every raw hex only in `css/tokens.css`, naming `pattern-color-weight`
(`--bg-primary-500`, `--text-neutral-50`, `--border-neutral-700`), base palette then semantic tokens. Stryds
mapping: primary-500 #a6ff00, neutral-950 #101010, 900 #171717, 700 #333333, 600 #3d3d3d, 400 #6f6f6f,
50 #fdfdfd, black #000000. Tints via `color-mix()` on the primary token. Spectrum ring stops are tokens; stop 1
= primary. JS reads colors with getComputedStyle. SVG uses currentColor/var().

## Screen (index.html), 1440x900 reference
- Left ~70%: a simulated desktop (neutral-950 wallpaper, top menu bar with clock and the Retoma status icon,
  bottom dock) with 4 draggable-free fake windows: **Documento** (writing a report), **Navegador**
  (Brightspace), **WhatsApp**, **Hoja de cálculo**. Windows are plain HTML, no images.
- Retoma status icon in the menu bar: an eye that is open (watching) or struck (paused). Click = pause 30 min /
  resume. Always visible. Tooltip "Pausado: no estoy viendo nada".
- Retoma panel (dropdown from the icon, Stryds cards 24px radius, hairline, no shadows): sections Ahora
  (current app + time in it), Retoma (resume card), Hoy (timeline), Privacidad.
- Right 30%: simulator panel: **Turno guiado** button with one-line Spanish subtitles + pause/skip/restart, and
  free-mode buttons: Cambiar de app · Llega un WhatsApp · Alejarme 25 min · Volver · Terminar el día · Pausar ·
  Borrar todo.
- **Resume card** (the hero moment): "Estabas en: Documento · Informe de calidad (párrafo 3)" / "Te
  interrumpió: WhatsApp, 25 min" / the 3 windows that were open as chips / one lime pill "Retomar" (reopens
  those windows with a staggered animation) and a secondary "Empezar de cero". Shown only after an away
  >= 10 min (demo: 25).
- **Hoy timeline**: horizontal bar of the day split by app (primary tints, not rainbow), a line "Planeado: 2 h
  de informe · Real: 1 h 20 min", and ONE AI proposal card: "Mañana: 90 min para el informe, 9:00 a 10:30,
  antes de que lleguen los mensajes." with "Aceptar" / "No, gracias". Declining leaves no trace.
- **Privacidad panel**: two columns. "Qué veo": nombre de la app y título de la ventana, cuánto tiempo.
  "Qué nunca veo": lo que escribes, el contenido de la pantalla, tu cámara, tu micrófono. Plus "Todo se guarda
  solo en este equipo", retention "7 días, luego se borra", and a red-free destructive pill "Borrar todo".
  Delete = confirm once, then the timeline and cards animate out and an empty state appears.

## Motion (Family Values, required)
Enter `cubic-bezier(0.16,1,0.3,1)` 300-400ms, exit `cubic-bezier(0.4,0,1,1)` 200ms, press scale(.97) 120ms.
Max 3 easings total. Panel opens with scale .96->1 + fade; windows reopen staggered 60ms; the resume card
slides up; timeline bars draw in with 40ms stagger. Nothing appears instantly. hover/active/`:focus-visible`
on every interactive. `@media (prefers-reduced-motion: reduce)` kills transitions/animations.
Keyboard: everything reachable; Esc closes the panel. Numbers use tabular-nums. Min text 14px.

## Guided story (~60 s, subtitles under the stage)
1. 09:00 working in Documento: "Retoma ve la app en uso. Solo el nombre, nunca lo que escribes."
2. WhatsApp message arrives, you switch: "Te interrumpieron. Lo anota, no te juzga."
3. 25 min away (fast-forward clock x30): "Te fuiste un rato."
4. Return -> resume card slides up: "Al volver, te dice dónde ibas."
5. Click Retomar -> windows reopen: "Un toque y vuelves a tu trabajo."
6. 18:00 timeline + AI proposal: "La IA propone. Tú decides."
7. Privacidad panel, then Borrar todo: "Tu historial es tuyo. Se borra en un gesto."

## Acceptance: write `tests/acceptance.js` (Playwright, see TESTING.md for the import path), run it, must pass
1. index.html loads with zero console errors.
2. Free mode: Cambiar de app changes "Ahora"; Alejarme 25 min + Volver shows the resume card with the
   previous app and the 3 chips; Retomar reopens those windows (assert visible).
3. Pausar: status icon shows paused, and a following Cambiar de app creates NO timeline entry.
4. Terminar el día shows the timeline and the proposal; Aceptar and "No, gracias" both close it.
5. Borrar todo requires a confirm, then timeline is empty and empty state visible.
6. Guided story runs to the end (hook `window.__storySpeed = 20`).
7. Token test: set `--color-primary-500` to `#ff0000` at runtime; walk every element and assert no computed
   color/background/border/fill/stroke equals `rgb(166, 255, 0)`.
8. grep: no hex/rgb literals outside css/tokens.css; no voseo words; no "productividad", "distraído",
   "puntaje" anywhere in the UI copy.
9. Reduced-motion block exists and covers transitions and animations.
Screenshots of each state into `shots/` and LOOK at them before you stop. `git init` and commit
"desktop: Retoma prototype" when green. Report in <= 10 lines.
