# L-login: wire the login screen (markup + CSS already done and committed, do NOT edit css/ or the #loginScreen markup)

Language: code, comments, commits in English. UI copy ES (neutral Colombian, no voseo) + EN via `js/i18n.js` DICT (English is the source string in markup; follow how other strings are translated, read i18n.js first).
Rules: stay in this directory. Never pkill/killall. Electron only via `xvfb-run -a`. No `git push`. Commit with `git add <files>` (never -A). Never delete or weaken an existing assertion.

## Context
`index.html` has `#loginScreen` (ids: loginForm, loginUser, loginPass, loginReveal, loginError, loginSubmit, loginGuest, loginTitle, loginGreeting, loginFace) and already loads `js/login.js` before `js/guide.js`. It does not exist yet. Retoma has NO accounts: this login is a visual demo, any non-empty input is accepted. Spanish is the default language, light the default theme.

## 1. `js/login.js` (IIFE, `window.Login`, same style as guide.js)
- `mount()`: called from the inline script at the bottom of index.html next to the other mounts (before `Guide.mount`). Shows the screen (remove `is-hidden`) unless `sessionStorage['retoma-login-v1'] === '1'` (a reload in the same session must not show it again). If hidden from the start, `onClose` callbacks fire immediately.
- Submit (form submit event, preventDefault): if user or password is empty, set `#loginError` text (role=alert already), set `aria-invalid="true"` on the empty input(s), focus the first empty one. Messages ES/EN: "Escribe tu nombre o correo y tu contraseña." / "Enter your name or email and your password." (or a per-field variant). Clear the error on input.
- Valid: add `is-busy` + `disabled` + text "Entrando…" / "Signing in…" for 600 ms, then set `#loginFace` `data-mood="back"` (smile), wait 400 ms, close.
- `#loginGuest`: closes at once (no validation).
- Close: add `is-leaving` (200 ms CSS fade), then `is-hidden`, set the sessionStorage flag, return focus to `#tabBtnAhora` (or body), run the `onClose` callbacks. Respect `prefers-reduced-motion` (close without waiting).
- Store the typed name (NEVER the password) in `localStorage['retoma-login-name-v1']`. On mount, if present, prefill `#loginUser`, show `#loginGreeting` ("Hola de nuevo, NAME" / "Welcome back, NAME") using textContent (never innerHTML), and focus the password field; otherwise focus `#loginUser`.
- `#loginReveal` toggles `type` password/text, `aria-pressed`, label Mostrar/Ocultar (Show/Hide).
- Focus trap inside `#loginScreen` (Tab / Shift+Tab). Esc does nothing (it is a gate; Continue without account is the way out). While open, set `inert` on `.stage` so the app behind is unreachable; remove it on close.
- Re-render the dynamic strings on language change (`I18n.onChange`), as guide.js does.
- Public API: `mount`, `open(invoker)` (shows it again, clears the session flag, resets fields and mood), `isOpen()`, `onClose(fn)`.

## 2. Guide ordering (`js/guide.js:mount`, last line)
Replace `if (!readSeen()) setTimeout(openLevel1, 80);` with: if not seen, `window.Login && Login.onClose ? Login.onClose(function () { setTimeout(openLevel1, 80); }) : setTimeout(openLevel1, 80)`. Make sure Guide's own focus-trap/keydown handlers do not fight Login while it is open.

## 3. Settings: "Cuenta" group
In `index.html` Settings tab (after the Guide group, `#guideReplay` area), add a `settings-group` titled "Account" / "Cuenta" with a text line "Demo session: no account is stored." and a `btn btn--secondary` "Sign out" / "Cerrar sesión" (id `settingsSignOut`) that calls `Login.open(thisButton)`. Reuse the existing settings-group markup. Add a Help (level 3) entry in `js/guide.js` renderHelp data for the login screen and for the Sign out button, in the same tuple format as the others.

## 4. i18n
Every new visible string and aria-label (title "Pick up where you left off" / "Retoma donde lo dejaste", labels Name or email / Nombre o correo, Password / Contraseña, Show/Mostrar, Hide/Ocultar, Sign in / Entrar, Continue without an account / Continuar sin cuenta, the hint "Demo: no account is created and nothing leaves this device." / "Demo: no se crea ninguna cuenta y nada sale de este equipo.", Signing in…, errors, greeting, Account group) goes in `I18n` DICT. Check how `I18n` handles text with a dynamic part (greeting) and attributes (aria-label); follow the existing pattern. Both languages must show no foreign words. Do not label anything as AI.

## 5. Tests
- `tests/support/seed.js`: also `window.sessionStorage.setItem('retoma-login-v1','1')` in the init script.
- The browser tests that do not use seed (`i18n.test.js`, `retention.test.js`, `rubric-b-fix1.test.js`, `settings-guide.test.js`) and any other that boots the page without seed: add the same sessionStorage flag through `addInitScript` (and `electron-smoke.js` if it breaks). `settings-guide.test.js` must still see the level-1 guide on a fresh profile, so for that file set only the login flag, never the guide flag.
- New `tests/login.test.js` (same style as settings-guide.test.js, no seed, a fresh context each time): (a) fresh launch shows the login in Spanish with the Entrar button, role=dialog and aria-modal; (b) empty submit shows a role=alert error in Spanish and marks the input invalid; (c) valid submit closes the login and then the level-1 guide opens; (d) "Continuar sin cuenta" closes it and the guide opens; (e) a reload in the same page session does not show it again but a new context does; (f) the password never appears in localStorage/sessionStorage and the name does after a valid sign-in, and it prefills on a new context sharing localStorage; (g) Tab stays inside the login (focus trap) and Esc does not close it; (h) Sign out in Settings reopens it; (i) switching to English shows no Spanish words and the ES screen shows no English words (reuse the ENGLISH/SPANISH regex idea from settings-guide.test.js, add 'sign in', 'password'); (j) all interactive controls are >= 44px high; (k) both themes: text contrast >= 4.5:1 for the title, labels and hint (compute from computed styles); (l) at 390px width no horizontal scroll (`scrollWidth <= clientWidth`).
- Run the whole suite: `for f in tests/*.js; do case $f in *electron-smoke*) xvfb-run -a node $f;; *) node $f;; esac; done` and `node tests/design-lint.js` (must stay 0). Everything green.

## 6. Screenshots
With Playwright into `shots/`: `login-1440-light.png`, `login-1440-dark.png`, `login-390-light.png`, `login-390-dark.png`, `login-error-1440.png`. Dark: set `localStorage['retoma-theme']='dark'` before load.

## Final message (max 12 lines)
Files changed, suite pass counts, any test you could not make pass and why, anything you changed outside this brief. Commit as "feat(login): behavior, i18n, settings sign-out and tests".
