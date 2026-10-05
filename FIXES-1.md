# FIXES round 1: verified by screenshots at 1440x900. Fix all, keep everything else and keep acceptance green.

1. **Panel is always open and stacks four sections** (Ahora, Retoma, Hoy, Privacidad), overflows the viewport
   (Privacidad is cut off) and covers the Navegador/Hoja de cálculo windows. Make it a real dropdown from the
   menu-bar eye icon: closed by default, Esc/click-outside closes it, max-height = viewport - 56px with its own
   scroll. Inside it use 3 tabs (Ahora/Hoy, Privacidad) so only one section shows; the RESUME CARD is NOT a tab:
   when it exists it is the first and largest element and the panel auto-opens on "Volver".
2. **The resume card must be the hero.** Make it larger: display type (Inter Tight 600, 28-36px) for
   "Estabas en: Documento" with the document title under it in Fog; "Te interrumpió: WhatsApp · 25 min" as a
   small label-tier line; the 3 chips; lime "Retomar" full width. Nothing else competes with it.
3. **Desktop must read as a desktop.** Windows must not be clipped by the panel (see 1) and must not overlap each
   other at 1440x900: lay them out in a non-overlapping arrangement; the focused window is raised with a
   hairline lime ring. Dock icons are emoji: replace with simple inline SVG glyphs using currentColor.
4. **Timeline bar has no legend.** Under the bar add a legend (dot + app name + minutes, tabular-nums) so the
   colors mean something; segment tints must stay distinguishable (not 4 near-identical greens: vary lightness
   steps clearly via color-mix) and each has a 2px gap.
5. **Label tier + type.** Section kickers (AHORA, HOY...) use one label style: Inter 500, uppercase, 12px,
   letter-spacing .18em. Numbers `font-variant-numeric: tabular-nums` everywhere. Body min 14px, kicker 12px ok.
6. **Responsive.** At 390px wide the layout is broken (menu bar title collides with the clock, desktop hidden).
   Under 900px: stack the simulator panel BELOW the stage, hide the dock, the menu bar keeps clock + eye, the
   Retoma dropdown becomes a bottom sheet. No horizontal scroll at 390.
7. **Pause state is invisible.** When paused, the whole menu bar gets a 2px dashed Fog underline, the eye icon is
   struck, and the Ahora section reads "Pausado: no estoy viendo nada". Add an assertion.

Add Playwright assertions for 1, 2, 3 (no window overlap: compare bounding rects), 4, 6 (scrollWidth <=
innerWidth at 390), 7. Screenshots at 1440 and 390 for: load, panel closed, resume card, timeline, privacy,
paused into `shots/`; LOOK at them. Tokens rule unchanged (no raw colors outside css/tokens.css). Stay in this
directory. Commit "desktop: fixes round 1". Report in <= 8 lines.
