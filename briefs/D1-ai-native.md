# D1: make Retoma FUNCTION: real AI wiring, persistence, native features (Electron). Read /home/nico/pf/MOTION-BIBLE.md for house rules.

Today the AI proposal is computed by a heuristic in the renderer and persistence is fake. Make it real.

## A. AI provider chain (main process only; renderer never sees keys)
- `ai/providers.js` in the main process, exposed via preload `contextBridge` as `window.retoma.propose(summary)`.
- `summary` = per-app minutes, longest uninterrupted block, first interruption time. NO window titles, NO text.
- Providers, in order of the user's chosen mode:
  1. `rules` (DEFAULT, on-device, no network): the current heuristic moved into a pure function.
  2. `local`: Ollama at http://127.0.0.1:11434 (GET /api/tags, pick the first model whose entry has no
     `remote_host`; today that is `huihui_ai/qwen3.5-abliterated:4b`), POST /api/generate with `format:"json"`.
  3. `cloud`: Gemini via `process.env.GEMINI_API_KEY` (never log or persist it). Call ListModels once, pick a
     "flash" model, generateContent with a JSON response schema. If the env var is absent, the option is disabled
     with the reason shown.
- Every provider call: 8s timeout, output validated against `{start:"HH:MM", minutes:int 15..180, reason:string<=140}`;
  invalid or failed -> fall back to `rules` and surface "Model unavailable, used on-device rules".
- UI (Privacy tab): "Smart suggestions" segmented control Off / Local model / Cloud model, default Off. Choosing
  Local or Cloud first shows the EXACT JSON payload that would be sent and an "Allow" button; consent persisted per
  mode. The proposal card shows its true source tag: "On-device rules" | "Local model · <name>" | "Cloud · Gemini".
  Remove the old "Simulated" tag only where a real provider ran. Loading state = shimmer skeleton.

## B. Persistence that is real
Events stored in `app.getPath('userData')/events.json` through IPC (renderer keeps an in-memory copy). Retention 7
days enforced on load and every hour. "Delete everything" really deletes the file. "Export my data" saves the JSON
via a native dialog. Keep the browser fallback (localStorage) so index.html still works without Electron.

## C. Native behavior
Tray icon (open / pause / resume / quit, state reflected in the icon), global shortcut Ctrl+Alt+R shows/hides the
window, native Notification "Pick up where you left off: <app>" when you return after >= 10 min away (click focuses
the resume card), single-instance lock. App is demo-data driven: say so in the Privacy tab ("Demo mode: tracks the
windows inside this demo").

## Acceptance (extend tests/electron-smoke.js and tests/acceptance.js; never delete or weaken an assertion)
1. `propose()` with mode Off returns a valid shape and makes zero network requests.
2. A fake Ollama (node http server on a random port, injectable via env RETOMA_OLLAMA_URL) proves: local mode with
   NO consent sends zero requests; with consent returns validated output; garbage output -> falls back to rules;
   timeout -> falls back.
3. Retention: an event dated 8 days ago is pruned on load. Delete-all removes events.json (assert file absent).
4. Tray + notification code paths covered by unit tests of their handlers (Electron can't show them headless).
5. No key material anywhere in the renderer bundle or logs (grep test for "GEMINI" outside main process files).
Commit "desktop: ai, persistence, native". Report <= 8 lines, each claim with the test that proves it.
