# APP PASS: English UI, light/dark switch, real desktop app (Electron). Keep behavior and keep tests green.

The demo will be shown from a PC as an APP, not by opening index.html. Three jobs, in this order.

## 1. English
Translate ALL user-visible copy to natural English (index.html, js/*.js, story subtitles, aria-labels, empty
states, the privacy panel, the AI "Cómo lo decidí" line -> "How I decided: ...", the "Simulado" tag -> "Simulated").
Keep the product name Retoma. Times use 24h ("9:00 to 9:40"). Update tests/acceptance.js: selectors/text to
English; the banned-words check becomes English ("productivity", "distracted", "score", "lazy", "wasted"); drop
the voseo check (or turn it into a check that no Spanish stopwords remain in index.html/js/*.js UI strings:
" el ", " la ", " de ", " que " inside quoted copy). Set `<html lang="en">`.

## 2. Light / dark switch
Add a theme toggle in the menu bar next to the eye icon (sun/moon inline SVG, `aria-label="Switch theme"`).
Default = `prefers-color-scheme`; persisted in localStorage inside try/catch. Implement with
`:root[data-theme="light"]` overriding SEMANTIC tokens only, inside css/tokens.css (base palette stays). Light
= warm paper (`#fdf1e1` family) wallpaper and surfaces, ink text, the same editorial serif, wallpaper gradients
and grain tuned for light. Lime on light has poor contrast: lime remains the fill for the Retomar button and the
focus ring with INK text on it, but any lime used as thin line/dot/text on light must use a darkened derivative
`color-mix(in srgb, var(--color-primary-500) 55%, black)`. Theme change animates (background/color 300ms,
expo ease). Contrast >= 4.5:1 for all text in both themes (add an assertion that computes it for 6 representative
elements in each theme). Token test must pass in BOTH themes: set `--color-primary-500` to `#ff0000` and assert no
element keeps `rgb(166, 255, 0)`.

## 3. Real desktop app (Electron, already installed via npm in this folder)
- `main.js`: BrowserWindow 1440x900 (min 1100x720), `autoHideMenuBar: true`, title "Retoma", backgroundColor
  from the theme, loads `index.html` via loadFile. Set `webPreferences: { contextIsolation: true }`. Esc closes
  nothing extra. Add accelerators: Ctrl+Shift+L toggles theme (via `webContents.executeJavaScript` on a
  `window.__toggleTheme` hook), F11 fullscreen. No network access needed; fonts: bundle the two Google fonts
  locally under `fonts/` (woff2 downloaded once with curl from fonts.gstatic.com, or use system fallbacks if
  download fails) so the app works offline.
- `package.json` exists with `npm start`. Add `npm run dist` using `electron-builder` ONLY if the install
  succeeds quickly; otherwise skip it and say so.
- Create `retoma.desktop` (Linux launcher: Name=Retoma, Exec=sh -c "cd /home/nico/pf/desktop && npm start",
  Terminal=false, Icon = an SVG you draw: lime ring on ink, saved as `build/icon.svg`) and install a copy to
  `~/.local/share/applications/retoma.desktop` and `~/Desktop/Retoma.desktop` (chmod +x).
- Add a Playwright-Electron smoke test `tests/electron-smoke.js` using `_electron.launch({args:['.']})` from the
  playwright package: window opens, title is "Retoma", theme toggle flips `data-theme`, screenshot saved.
  If playwright-electron cannot run under Wayland here, run it with `--ozone-platform=x11` or xvfb-run and note it.

## Done when
`node tests/acceptance.js` and `node tests/electron-smoke.js` pass; screenshots of the app window in DARK and
LIGHT (resume card + timeline) in shots/ and you LOOKED at them; no Spanish left in the UI (grep proof in your
report). Commit "desktop: english, light mode, electron app". Report <= 8 lines.
