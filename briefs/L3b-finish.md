# L3b: FINISH L3 (live honesty). The honesty work is already in the tree and good: live-honesty.test.js 9/9, live.test.js 27/27. Do NOT redo it, do NOT touch AI providers (an unrelated "AI pass" is out of scope).

One failing assertion in `node tests/acceptance.js`: "after Resume windows still left of panel". After pressing Resume at 1440x900 the Spreadsheet window's right edge is 717px but the open panel's left edge is 592px (Document 311, Browser 580, WhatsApp 284 are fine). Earlier work guaranteed all 4 windows end left of the panel; something in the Demo/Live changes (window layout, `inert`, new CSS) broke the reopen layout. Find the cause, fix the CODE (never weaken the assertion), keep the reopen animation.

Then verify and finish:
1. Run ALL suites: `node tests/acceptance.js`, every `tests/*.test.js`, and `xvfb-run -a node tests/electron-smoke.js`. All green.
2. Regenerate Live screenshots (dark + light: setup card, empty state, with fake events) and Demo resume (dark + light); LOOK at them; confirm the Live setup card shows NO demo text ("Quality report", "40 min").
3. Commit "desktop: live honesty". Then `mkdir -p .stage && touch .stage/L3-live-honesty`. Report <= 5 lines.
