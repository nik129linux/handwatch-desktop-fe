# L3: Live mode must never show demo data as real. Fix from review of shots/live-setup.png and shots/live-dark.png. Read /home/nico/pf/MOTION-BIBLE.md.

Seen: in Live mode with the helper missing, the view says "TODAY: DOCUMENT 40 MIN · BROWSER 12 MIN · WHATSAPP 18 MIN · SPREADSHEET 10 MIN"
(the demo's seeded history) and the demo windows show as faded ghosts behind the setup card. That is a lie about the user's real PC.
1. Live mode reads ONLY live events. With no live events: "Now: waiting for activity" (or the helper state), Today = empty state "Nothing tracked yet", no timeline bar,
   no AI proposal (propose() must not run on demo history in Live). Demo history and demo events must never leak into Live, and live events must never leak into Demo
   (separate stores, e.g. events.json per mode `events-live.json` / `events-demo.json`; migrate nothing silently).
2. The fake demo windows are fully removed from layout and the a11y tree in Live (display:none + inert), not faded.
3. Setup card: numbered steps (1 Install helper, 2 Log out and back in, 3 Enable and check) with the exact `gnome-extensions enable retoma-focus@retoma.local` command visible and copyable in step 3 from the start; card copy in plain English; contrast >= 4.5:1 in both themes.
4. live-dark.png was captured mid-transition (blurred). Screenshot tests must wait for the crossfade to settle; assert exactly one of Demo/Live views is visible at settle.
5. Tests (never weaken any): Live with RETOMA_LIVE_FAKE absent and helper missing shows the empty state and NO text from the demo seed (assert a list of demo strings is absent: "Quality report", "Brightspace", "40 min"); Live with fake events shows only those; switching Demo->Live->Demo keeps both histories separate; demo windows are `inert`/hidden in Live; Delete everything in Live deletes only the live store (and says so).
Run ALL suites: acceptance, every tests/*.test.js, electron-smoke under xvfb. Regenerate Live screenshots (dark+light, setup, empty, with fake events) and LOOK at them.
Commit "desktop: live honesty". Then `mkdir -p .stage && touch .stage/L3-live-honesty`. Report <= 6 lines.
