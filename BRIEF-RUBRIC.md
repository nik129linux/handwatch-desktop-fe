# BRIEF-RUBRIC (phase A) — make this app pass the professor's rubric

You are editing ONE app in this directory only. Read this whole file, then the existing code before changing anything.
Language rule: code, comments, commit messages in English. UI copy: Spanish (neutral Colombian: "agregar", "presiona", never "añadir/pulsa/vosotros") + English.

## Must deliver (all binary, all required)
1. **Spanish is the default language.** Fresh profile (empty storage) opens in Spanish regardless of OS/navigator language. `<html lang>` follows the active language. Switching language must NOT reload the page or lose app state.
2. **Light theme is the default.** Fresh profile opens light. Theme options: Claro / Oscuro / Sistema (Claro default). Persisted.
3. **A real Settings screen** ("Configuración" / "Settings"), reachable from the main navigation with a gear icon, containing at least: Idioma (Español/English), Tema (Claro/Oscuro/Sistema), Inteligencia artificial (on/off + a way to revoke/re-grant consent if the app has consent), Privacidad (what data is kept, delete-all if the app has it), Ayuda (opens level 3 of the guide), "Ver la guía otra vez" (replays level 1). Existing header toggles may stay as shortcuts but Settings is the canonical home.
4. **A three-level guide**, all translated ES/EN:
   - Level 1 — first-run welcome: 3 short screens/cards (what the app is for, the core action, privacy/AI promise), with progress dots, Siguiente/Atrás, Saltar. Shown once on first launch (persist "seen"), replayable from Settings.
   - Level 2 — contextual coach marks: the first time the user reaches each key feature (at least 3 features), a small dismissible tip anchored to it. Each shown once, persisted.
   - Level 3 — a Help/Ayuda screen inside Settings: a FAQ / reference of every feature and every icon/status the app uses (plus a glossary if the app has domain terms).
   The guide must work in the app's real mode, not only in a demo mode. Keyboard accessible: Esc closes, focus is trapped in modal steps and returned afterwards, role=dialog + aria-modal.
5. **No English visible in Spanish and no Spanish visible in English** on every screen you touch, including dynamic strings, aria-labels, placeholders, tooltips, CSS `content:` strings, error messages. Plurals correct in both languages ("1 pendiente" / "2 pendientes", "1 block" / "2 blocks"). Numbers/times formatted with `Intl` for the active locale where numbers are shown.
6. Design: use ONLY the app's existing design tokens/components (read its tokens CSS first). No new raw colors, no new fonts. Light and dark both must look designed, contrast >= 4.5:1 for text. Respect prefers-reduced-motion. Touch/click targets >= 44px.

## Tests
- Add a test file for this phase (follow the style of the existing tests) that asserts items 1-5 in a real browser: fresh profile opens ES + light; Settings reachable and switches language without reload (assert some in-memory state survives); level 1 shows on first run and not on second; a coach mark shows once; Help screen exists; scan visible text in ES for a list of the app's English words and fail if any appear.
- Existing tests that hardcode English as default must be updated to Spanish default; do NOT delete or weaken other assertions.
- Run the FULL existing suite (every test file, see the command below) and keep it green. Paste the final pass counts in your last message.

## Do not
- Do not touch files outside this directory. Do not change the AI backend/server logic, the product concept, or unrelated features.
- No `git push`. Commit in small steps on the current branch with clear English messages (`git add` only the files you changed; never `git add -A`).
- Never pkill/killall; run Electron only via `xvfb-run -a`.

## Final message
List: files changed, each requirement 1-6 with PASS/FAIL and the evidence (test name or file:line), full test-suite counts, anything you could not do.

## App-specific (Retoma desktop, Electron)
- Today: `js/i18n.js:5` hardcodes 'en', `index.html:2` lang=en, `tests/i18n.test.js` asserts English default. Theme defaults to OS. Language toggle lives in the titlebar; "Privacy" tab acts as settings.
- Make Settings a 4th tab (Now / Today / Privacy / Settings) or move settings out of Privacy into it; keep Privacy as the "what I see / never see" page.
- Untranslated today: "Start", "Use a time like 9:30 and 15–180 min", "Test", "Testing…", "Connected · model", "Not reachable", "Thinking…", "The server did not answer…", "AI requests: N left", "AI limit reached…", "Needs the desktop app", demo app names Document/Browser/Spreadsheet (→ Documento/Navegador/Hoja de cálculo), plurals in ai/habits.js:469,482. Tray menu + notification must follow the language on launch (renderer must call window.retoma.setLang on mount).
- The guide's level 1 must also exist in Live mode (today the tour is demo-only, css/app.css:55-56). Keep the existing 7-step demo tour.
- Test command (run all): `for f in tests/*.js; do case $f in *electron-smoke*) xvfb-run -a node $f;; *design-lint*) node $f;; *) node $f;; esac; done` and add a `"test"` script to package.json that runs them all.
