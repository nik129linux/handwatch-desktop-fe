# D2: visual signature, fe/-level motion. Read /home/nico/pf/MOTION-BIBLE.md and study fe/mostar, fe/gravity, fe/space in depth (run them, read the JS).

Behavior stays; this stage is craft. Make people say "how is this a student project".
1. **Living presence field** on the wallpaper (Gravity-inspired): a soft field of ~40-60 glass/matte spheres or
   particles drifting. States: watching = calm drift with pointer repel; interruption = scatter; away = slow dim;
   resume card = particles gather into a ring around the card; paused = frozen and desaturated. Implement with a
   locally bundled `three` (npm install three, import from node_modules path via a plain script copied to `vendor/`)
   or a hand-written canvas 2D if WebGL is unavailable. Pauses when hidden; static gradient fallback under
   prefers-reduced-motion or WebGL failure. Colors read from tokens via getComputedStyle (token test must still pass).
2. **Entrance choreography** on launch: wallpaper bloom, menu bar slides, windows fly in staggered 70ms from the
   dock, headline blur-in word by word. <= 1.4s total, CTA-level content never delayed more than 0.4s.
3. **The resume moment** (hero): backdrop dims + blurs 8px, the card scales out of the eye icon, headline word
   reveal, chips FLIP-animate; on "Resume" the chips fly to their window positions and the windows reopen with a
   spring settle.
4. **Timeline**: bar segments draw left to right, minutes count up, hover scrubs a vertical rule with a readout.
5. **Theme switch**: View Transitions circular reveal from the toggle button (fallback fade).
6. **Micro-interactions**: magnetic primary buttons (<= 6px pull, lerp), tactile press, focus rings that animate in,
   the eye icon blinks when state changes, tabs underline slides between tabs.
7. **Dark and light both crafted**: light theme is warm paper with ink; verify grain/glow/particles read well in both.

## Acceptance
Existing tests green; new assertions: particle canvas present and animating in the guided story (frame counter
advances), frozen when paused, absent under reduced-motion; PerformanceObserver long tasks > 100ms == 0 during the
story; theme transition class cleaned up afterwards; token test still passes in both themes. Screenshots of 6 key
moments x 2 themes in shots/ and you LOOKED at them; redo any that look flat or generic.
Commit "desktop: visual signature". Report <= 8 lines, naming which reference gave which technique.
