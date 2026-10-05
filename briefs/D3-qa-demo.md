# D3: QA like a hostile user, then write the demo script. Read /home/nico/pf/MOTION-BIBLE.md.

1. Drive the real Electron app with playwright `_electron` through: guided story to the end, every free-mode button
   in every order that could break state (pause mid-away, delete then resume, theme toggle during story, double
   clicks, Esc, tab key through the whole UI), at 1100x720, 1440x900, 1920x1080, in dark AND light. Fix every bug,
   overflow, clipped text, dead control, console error, focus trap, missing aria-live on the resume card.
2. Accessibility: contrast >= 4.5:1 sampled across 12 elements per theme, logical tab order, `aria-label`s, reduced motion.
3. Add a regression test for each bug you fixed.
4. Write `DEMO.md` (English, <= 1 page): how to launch (launcher + `npm start`), a 2-minute presenter script
   with exact clicks and what to say at each beat, what is real vs demo data (AI providers, persistence, tray),
   and 3 anticipated professor questions with honest answers (e.g. "does it read my real windows?" -> demo mode,
   and why Wayland blocks real tracking). Write `README.md` for the repo.
5. Final: `node tests/acceptance.js` and `node tests/electron-smoke.js` green. Commit "desktop: qa and demo".
Report <= 8 lines: bugs found/fixed (count + the nastiest), anything you could not fix.
