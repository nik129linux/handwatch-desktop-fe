# L1 SPEC + BRIEF: Retoma LIVE MODE core (real focus + real idle on GNOME Wayland). Read /home/nico/pf/MOTION-BIBLE.md for house rules. English everywhere.

## Objective
Today Retoma only tracks its own demo windows. Add a LIVE source that reports the user's REAL focused app and REAL idle time,
feeding the SAME event bus the demo uses, so the resume card / timeline / proposal work on the real PC. Demo mode stays the default.

## Assumptions (verified on this machine)
GNOME Shell 50.1 on Wayland. `GetWindows` on org.gnome.Shell.Introspect is AccessDenied to apps. Idle time works:
`gdbus call --session --dest org.gnome.Mutter.IdleMonitor --object-path /org/gnome/Mutter/IdleMonitor/Core --method org.gnome.Mutter.IdleMonitor.GetIdletime` -> `(uint64 15433,)` (ms). `wmctrl` exists but only sees XWayland. Therefore focus
needs our own tiny GNOME Shell extension that exports a D-Bus API; a new extension needs a logout/login before it loads (the USER does that later; you cannot).
No new npm dependencies: talk to D-Bus by spawning `gdbus` (monitor/call) from the Electron main process.

## Deliverables (all inside this folder)
```
live/gnome-extension/retoma-focus@retoma.local/metadata.json   shell-version ["48","49","50"]
live/gnome-extension/retoma-focus@retoma.local/extension.js    ESM GNOME 45+ style
live/focus-source.js     main-process module: connect, parse, emit
live/idle-source.js      idle polling
live/live-tracker.js     state machine: focus + idle -> the app's existing events
tests/live.test.js       node unit tests (no display, no D-Bus)
```
1. **Extension** (`import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js'`): own bus name
   `org.retoma.Focus`, object `/org/retoma/Focus`, interface `org.retoma.Focus` with signal `FocusChanged(s appId, s appName, s title)`
   and method `GetFocus() -> (s appId, s appName, s title)`. Export with `Gio.DBusExportedObject.wrapJSObject(xml, impl)`. Track
   `global.display` `notify::focus-window` and the focused window's `notify::title`. appId from `get_gtk_application_id()` or
   `get_wm_class()`; appName from `Shell.WindowTracker.get_default().get_window_app(w).get_name()` when available. `enable()` exports and
   connects; `disable()` unexports, disconnects everything, nulls references (extension review rules). No timers left behind. Run `gjs -m --check`
   style syntax validation if `gjs` exists; otherwise careful review. Do NOT try to install or enable it (the user does, after a re-login).
2. **focus-source.js**: `createFocusSource({spawn, execFile})` (injectable for tests). Spawns `gdbus monitor --session --dest org.retoma.Focus --object-path /org/retoma/Focus`,
   parses `org.retoma.Focus.FocusChanged ('app.id', 'Name', 'Title')` lines robustly (quotes, escapes, unicode), reconnects with backoff when the
   bus name disappears, exposes `status()` = `'ready' | 'extension-missing' | 'error'` using `gdbus call ... org.freedesktop.DBus.NameHasOwner`-style check on `org.retoma.Focus`.
3. **idle-source.js**: polls GetIdletime every 5 s (injectable exec + clock), emits `idleMs`; no polling when Live is off.
4. **live-tracker.js** (pure, injectable clock): consumes focus + idle and emits the events the existing app already understands
   (study `js/events.js` and `js/retoma.js` for the real shapes and reuse them, do not invent parallel formats):
   focus change -> focus event; idle >= `awayAfterMin` (setting, default 5, options 2/5/10) -> away starts; first activity after away -> return, which triggers the resume card
   exactly like the demo; Retoma's own window never counts as an app; same-app title changes only update minutes, not a new episode; sub-3-second focus blips are merged.
5. **Privacy defaults baked into the tracker** (settings object passed in): `storeTitles` default FALSE (store app name only; when false the title is dropped
   BEFORE anything is persisted or sent to the renderer), titles truncated to 60 chars when enabled; `blocklist` default includes
   `keepassxc, bitwarden, 1password, org.gnome.seahorse, gnome-keyring, polkit` (matched on appId/appName, case-insensitive): blocklisted apps are
   recorded as "Private app" with no title and are never named; paused state records nothing.

## Acceptance (tests/live.test.js, run with `node tests/live.test.js`; also keep `node tests/acceptance.js` and `xvfb-run -a node tests/electron-smoke.js` green)
1. Parser: 12+ real-looking `gdbus monitor` lines including quotes, unicode, empty title, very long title, garbage lines (ignored, no throw).
2. Tracker with a fake clock: focus sequence -> correct episodes and minutes; 4 s blip merged; Retoma's own window ignored; same-app title change no new episode.
3. Away/return: idle 4:59 no away; 5:00 away; activity -> exactly one return event carrying the previous app and the away minutes; `awayAfterMin` 2/5/10 honored.
4. Privacy: titles off by default -> persisted/emitted event has no title field; on -> truncated to 60; blocklisted app never appears by name; paused emits nothing.
5. focus-source reconnect: fake spawn that dies twice then works -> reconnects with backoff, status transitions correct; name missing -> `extension-missing`.
6. The extension JS passes a syntax check if gjs exists (otherwise state that you could not run it); metadata.json valid.
## Boundaries
Always: injectable IO, no globals, tests first for the parser and state machine. Ask first: n/a (decide and note in your report). Never: add npm deps, touch ~/.local, enable
extensions, call gnome-extensions, use pkill, record keystrokes or screen content, delete or weaken any existing assertion.
Commit "desktop: live core". Then `mkdir -p .stage && touch .stage/L1-live-core`. Report <= 8 lines, each claim with its test.
