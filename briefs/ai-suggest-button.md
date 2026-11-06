# Brief: "Suggest with AI" button that proves the AI is real (desktop)

Goal: one visible button on the proposal card that calls the real Retoma server model and shows proof (model, latency, quota, exact payload).
Touch only: index.html, js/retoma.js, css/retoma.css (and css/tokens.css only for new tokens), tests/acceptance.js. Do not commit. Do not touch ai/, main.js, preload.js, dist/, the Now ring.
Test-first: add the red acceptance checks, run them, then build. Read how tests/acceptance.js already stubs window.retoma and reuse that stub.

## UI (index.html, inside #proposalCard)
- Label row becomes a flex row: left the existing "Suggestion · <tag>", right `<button id="aiSuggestBtn" class="btn btn--ai" type="button">` = a small copy of the existing ring face markup (`<span class="ring-face">` with 2 `.ring-eye` + `.ring-mouth`, ~18px, inside a lime ring outline) + text "Suggest with AI". This face is the AI logo. No emoji, no sparkles, no gradients, no purple, no glow.
- `#aiSuggestConsent` (hidden by default): text "Sends app names and minutes to the Retoma server. No titles, no notes." + `<details><summary>See exactly what is sent</summary><pre id="aiSuggestPayload"></pre></details>` + buttons "Send" (btn--primary) and "Cancel" (btn--ghost).
- `#aiProof` (hidden by default), under #proposalHow: one line `#aiProofLine` + `<details><summary>What the model saw</summary><pre id="aiProofPayload"></pre></details>`.

## Behaviour (js/retoma.js)
- Click when state.aiMode === 'server' and state.aiConsent.server: run it. Otherwise show #aiSuggestConsent and fill #aiSuggestPayload from the existing previewPayload path (same one Privacy uses; server mode). "Send" = enable server mode + consent through the SAME function the Privacy panel uses (so it persists and the Privacy radio updates), hide the panel, run it. "Cancel" hides it.
- Run: t0 = performance.now(); button disabled, label "Thinking…", face gets `.is-thinking`, card `.is-loading`; call window.retoma.propose(summary, { mode:'server', consent, lang }) with the same summary the card already builds. On result: render the proposal exactly like the normal path (text, how, tag), then:
  - real model (source starts with "Retoma server"): #aiProofLine = "<model> · Retoma server · <x.x> s · <N> requests left" (model = text after "· " in source; omit the quota part if unknown). The new text gets `.is-fresh` once (short fade+rise, 240ms, none under prefers-reduced-motion).
  - fallback: #aiProofLine = "The server did not answer, so on-device rules made this one." If result.limitReached, also trigger the existing limit notice.
  - #aiProofPayload = the JSON that was sent (previewPayload for server mode), pretty-printed.
- Always restore the button ("Suggest with AI", enabled, no .is-thinking), also on error. Without the desktop bridge (plain browser) the button stays but is disabled with title "Needs the desktop app".

## Style (css/retoma.css)
`.is-thinking .ring-eye` = eyes glance left-right (keyframes, 1.2s loop); none under prefers-reduced-motion (static eyes, the label still says Thinking…). btn--ai: same size scale as other ghost buttons, lime only on the face ring outline and on focus-visible. Colors/spacing only from css/tokens.css variables. `node tests/design-lint.js` must stay 0.

## Copy rules
English. No judging words (productive, distract, score, lazy, wasted, "the user").

## Acceptance (binary, in tests/acceptance.js)
- #aiSuggestBtn visible on the proposal card and contains .ring-face.
- AI off: click -> #aiSuggestConsent visible, #aiSuggestPayload JSON parses and contains no "title" and no "note" key.
- Send with a stub propose that resolves after ~300ms with { source:'Retoma server · gemma4:31b', quota:{left:47,limit:50}, start:'9:30', minutes:45, reason:'...' }: during the wait the face has .is-thinking and the label reads "Thinking…"; after it #aiProofLine contains "gemma4:31b", "Retoma server", " s ·" and "47 requests left", #proposalText changed, the Privacy AI mode is now server.
- Stub fallback ({ source:'On-device rules', fallback:true }): proof line says "on-device rules made this one".
- Screenshot shots/34-ai-suggest.png after the success case.
- Must pass: node tests/acceptance.js, node tests/design-lint.js, and every other tests/*.js (run all before and after).
Report: files changed, test counts before/after. Max 8 lines.
