# DESIGN PASS: kill the "AI slop" look (verified: it reads as generic dark cards + pills). Keep behavior and tests.

The current UI is a grid of identical bordered rounded boxes, tracked-caps labels everywhere, one lime button.
That is the slop. Study these three references FIRST (read-only, absolute paths; open the HTML, read the CSS/JS,
screenshot them with Playwright) and copy their *language*, not their content:
- /home/nico/Desktop/me/lifemax/domains/aiservices/fe/mostar/{index.html,styles.css,script.js}: cinematic editorial
  type (large serif display, warm paper-on-ink), layered depth, one smoothed scroll/pointer value driving CSS vars,
  `transition: transform 640ms cubic-bezier(0.22,1,0.36,1)`, shade gradients only under text.
- /home/nico/Desktop/me/lifemax/domains/aiservices/fe/gravity/index.html: mono micro-labels (JetBrains Mono 10-11px),
  glass chrome used sparingly, cursor parallax with lerp, one expo ease everywhere, palette that morphs with state.
- /home/nico/Desktop/me/lifemax/domains/aiservices/fe/space/index.html: blur-in word-by-word headline reveal
  (opacity+blur+translateY, 100ms stagger, easeOut 0.7-0.9s), liquid-glass pill.

## What to change (composition, not just colors)
1. **Typography is the design.** Display = a high-contrast serif for the big statements (Google Fonts: Instrument
   Serif or Fraunces) at poster scale (72-140px) for the resume headline "Estabas en Documento" and the day
   statement; body Inter; labels JetBrains Mono 11px (replace the tracked-caps Inter labels). Max 3 type sizes per view.
2. **Fewer boxes.** Remove cards-in-cards. The Retoma panel is NOT a stack of bordered cards: sections are
   separated by whitespace and one hairline; the resume card is full-bleed inside the panel with a large headline,
   not a bordered box with chips. The simulator panel on the right becomes a quiet control strip (mono labels,
   text buttons), not 10 pill buttons.
3. **Depth and atmosphere.** The simulated desktop gets a real wallpaper: layered radial gradients in token colors
   (no images), a grain overlay via inline SVG feTurbulence at 4% opacity, windows with soft layered shadows and a
   `backdrop-filter: blur(18px)` glass title bar (Gravity/Space), focused window lifts (translateY -4px, scale 1.01).
4. **Motion with intent.** One master ease `cubic-bezier(0.16,1,0.3,1)` for entrances (+ the 200ms exit and press
   already defined; max 3 easings). Headline blur-in word by word (100ms stagger). Cursor parallax on the wallpaper
   and windows (lerp 0.08, +-10px, desktop + no-preference only). "Retomar" reopens windows with a staggered
   fly-in from the dock icon positions. Timeline bar draws left to right with segment stagger. All off under
   prefers-reduced-motion.
5. **Color discipline.** Tokens architecture unchanged (the professor changes `--color-primary-500` and checks
   nothing old remains). Primary stays the single accent, used ONLY for the focused-window ring, the Retomar
   action and the live-watching dot. Everything else is neutral/paper tints derived with `color-mix()`.
   You may ADD warm paper tokens (e.g. neutral-100 `#fdf1e1`) in css/tokens.css; no raw color elsewhere.
6. **The AI must stop being a hardcoded string.** `js/retoma.js`: compute the proposal from the day's timeline
   (find the longest uninterrupted block and the hour before the first interruption; propose that window for
   tomorrow with the real minutes). Show under it a one-line mono "Cómo lo decidí: <the numbers it used>" and a
   visible tag "Simulado" (no model is called; the copy must not claim a real LLM). Declining still leaves no trace.
   Add assertions: proposal text changes when the timeline data changes; the "Simulado" tag is visible.

## Done when
`node tests/acceptance.js` passes (update selectors if you rename, never delete an assertion; add assertions
for 4 and 6; no raw colors outside tokens.css; no voseo). Screenshots at 1440 and 390 (load, resume, after
Retomar, timeline, privacy) into shots/ and LOOK at them: if a screen still looks like uniform rounded cards,
redo it. Commit "desktop: design pass". Report in <= 8 lines, including which reference gave which technique.
