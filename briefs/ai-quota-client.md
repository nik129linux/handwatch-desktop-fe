# Brief: Retoma server AI for habits/ask + visible quota + Adjust (desktop)

Goal: with AI mode "server", every AI surface (proposal, resume line, habit coach, Ask your day) uses the Retoma server, and the person always sees how many AI requests are left. Rules keep working at all times.
Do not commit. Do not touch: dist/, build/, live/, fonts/, package.json, the face/ring code, tests you are not told to extend.

## Server contract (already being built, do not implement it)
POST {apiBase}/api/retoma/habits {metrics, lang} -> {ok, note, experiment, source, fallback, quotaLeft, quotaLimit}
POST {apiBase}/api/retoma/ask {metrics, question, lang} -> {ok, answer, source, fallback, quotaLeft, quotaLimit}
Every AI response (incl. /propose, /resume-line, 400, 429) has headers X-Quota-Left / X-Quota-Limit. Daily cap spent: 429 {ok:false, quotaLeft:0, quotaLimit}.

## Build (test-first: add the red tests, run them, then code)
1. ai/providers.js: `serverHabits(metrics, opts)` and `serverAsk(metrics, question, opts)` modelled on serverPropose (fetchWithTimeout + raceTimeout, 8 s). Question sliced to 200. Output must pass habits.validateReport + habits.groundedReport / habits.validateAnswer + habits.groundedAnswer, else throw -> rules fallback. `habitsReport` and `habitsAsk` use them when mode === 'server' with consent (today they only do 'local').
2. Quota: one helper reads `X-Quota-Left`/`X-Quota-Limit` (header, else body quotaLeft/quotaLimit) from every server* response and calls `opts.onQuota({left, limit})`. 429 -> onQuota({left:0, limit}) and the result falls back to rules with `limitReached: true`. main.js passes an onQuota that saves `{left, limit, at}` with new `loadQuota/saveQuota` in ai/store.js (JSON file in userData, like experiments) and exposes `retoma:ai:quota` through preload as `window.retoma.aiQuota()`. Every AI IPC result also carries `quota` so the renderer can repaint.
3. Quota bar, in the AI panel (next to the proposal / habit cards) and in Privacy (AI mode area): text "AI requests: N left" + `div.quota-bar > div.quota-fill` with inline width = left/limit %. Hidden when mode is not "server" or quota unknown. At 0 (or limitReached): text "AI limit reached. Connect Ollama to keep going." + button "Connect Ollama" that opens the Privacy tab, selects local mode and focuses an input for the Ollama URL (default http://127.0.0.1:11434) with a "Test" button that calls the existing aiStatus IPC with that URL and shows "Connected · <model>" or "Not reachable". Nothing gets blocked: rules answers still show.
4. Proposal card: buttons Accept / Adjust / No, thanks. Adjust reveals an inline editor: start time text input (H:MM) and minutes with "−15" / "+15" buttons. Valid = parseClock accepts the time and minutes are 15-180 (buttons clamp). Invalid -> inline message "Use a time like 9:30 and 15–180 min", Accept disabled. Accepting saves the adjusted block and the card text shows the new window.
5. Ask your day: input stays maxlength 200 and the value is also sliced to 200 before sending; the answer shows its source label ("Retoma server · <model>" or "On-device rules").
6. Resume line: confirm server mode sends note+title when present, otherwise just app; keep the banned words and 140-char cap. Change nothing if it already does.

## Rules
English UI. No judging words in copy (productive, distract, score, lazy, wasted, "the user"). Colors/spacing only via variables from css/tokens.css (new tokens go there); `node tests/design-lint.js` must stay at 0. Lime only for action/active/focus. No keys or fetch in the renderer.

## Tests (binary acceptance)
- tests/server-mode.test.js (or a new tests/quota.test.js): serverHabits/serverAsk valid -> server source; ungrounded or "lazy" -> rules; 429 via fetchImpl mock -> rules + limitReached + onQuota left 0; header X-Quota-Left 7 -> onQuota({left:7, limit}); question of 500 chars -> body question length 200; timeout -> rules.
- tests/acceptance.js (Playwright on index.html; use whatever stub of window.retoma the file already uses): quota bar renders with the right width; quota 0 shows the limit notice + Connect Ollama, which lands on Privacy with the URL input focused; Adjust with "25:99" shows the message and disables Accept, "+15" past 180 clamps at 180; typing 300 chars into Ask keeps 200.
- Must pass: `node tests/acceptance.js`, `node tests/design-lint.js`, and every other tests/*.js that passes now (run them all before and after).
Report: files changed, test counts before/after. Max 8 lines.
