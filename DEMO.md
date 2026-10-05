# Retoma — demo script (2 minutes)

## Launch
- From the app grid: open **Retoma** (`retoma.desktop`, installed in `~/.local/share/applications` and `~/Desktop`).
- From a terminal: `cd ~/Documents/U/Co/U/4s/courses/interfaces/tareas/proyecto\ final/desktop && npm start`
  (under Wayland the smoke test uses `xvfb-run -a node tests/electron-smoke.js`).

## Presenter script
1. **Guided tour (0:00).** Click **▶ Guided tour**. Say: "Retoma watches which app and window title are in use — never what I type. It notices the interruption, the time away, and offers one resume card." Let it run to the end (~60 s, or **Skip to end**).
2. **Resume (0:45).** Click **Resume**. Say: "One click reopens exactly the three work windows, staggered, and the suggestion for tomorrow appears under Today with its reasoning attached."
3. **Privacy (1:15).** Open the eye icon → **Privacy** tab. Say: "Only app names and titles ever leave a trace; content, screen, camera and microphone are off limits. History auto-deletes after 7 days; **Delete everything** asks first and empties the on-device store."
4. **Theme (1:45).** Click the sun/moon toggle. Say: "Light and dark share one token file — flipping the primary color re-skins the whole app, both themes."

## Real vs demo data
- **Real:** Electron shell (tray with Pause/Resume, return notification, global shortcut, single instance), JSON event persistence with 7-day retention, export/delete, theme persistence, offline fonts.
- **Rule-based suggestions are real logic; AI providers are demo-gated:** Off mode and on-device rules always work with zero network. Local model calls Ollama only after explicit per-mode consent (payload preview shown); cloud calls Gemini only with `GEMINI_API_KEY`. No key, no request — the UI says why.
- **Simulated:** the four desktop windows are an in-app simulation; the app does not read real OS windows.

## Anticipated questions
- **"Does it read my real windows?"** No — demo mode tracks only the windows inside this demo. Real OS tracking is intentionally absent: on Wayland, compositors deny window-title snooping by design, so a real tracker would need portal APIs and explicit user consent per window.
- **"Where does my data go?"** Nowhere: `events.json` in the app user-data dir, 7-day retention, export and delete in the Privacy tab, AI payloads only after opt-in consent.
- **"What happens if I pause mid-away or delete then resume?"** Pause cancels the away episode (no phantom resume card); Resume after delete-all is a no-op. Both are covered by regression tests in `tests/acceptance.js` §30.
