# L2 SPEC + BRIEF: Retoma LIVE MODE UI, settings, installer, manual steps. Builds on L1 (live/ modules already exist and are tested). Read /home/nico/pf/MOTION-BIBLE.md. English everywhere.

## Objective
The user can switch Retoma between Demo and Live (this PC), see it work on their real desktop, understand what is and is not recorded, and get the helper extension installed with consent.

## Deliverables
1. **Mode switch** "Demo / Live (this PC)" in the menu bar next to the eye icon and in the Privacy tab; default Demo; persisted in the settings file via main-process IPC. Switching never loses stored data.
2. **Live view** (replaces the fake windows area while Live): calm presence field kept, big serif "Now: <app> · <minutes>" (app name only unless titles enabled), the real timeline of today built from the live events, a status chip: `Tracking this PC` / `Waiting for helper` / `Paused`. The panel (Now / Today / Privacy) works unchanged on real events. Simulator buttons are disabled with a tooltip in Live.
3. **Resume card in Live**: shown on return after `awayAfterMin`. Honest copy: the Resume button becomes **"Got it"** and the card lists the apps used before the interruption (Retoma cannot reopen windows on Wayland: say so in one line, "Retoma can't reopen windows here; it reminds you where you were"). A native notification fires on return as in demo.
4. **Live settings** (Privacy tab): Away after 2/5/10 min; "Include window titles" toggle default OFF with plain explanation (browser tab titles can be sensitive); blocklist editor (add/remove app names; defaults from L1); "Pause tracking" (also from tray). Update the "What I see / never see" text so it is TRUE per mode (Live default: app name + minutes only).
5. **Helper installer**: if `focus-source.status()` is `extension-missing`, the Live view shows a setup card with 3 numbered steps and a button **"Install helper"**: shows a native dialog listing exactly what will be copied and where (`~/.local/share/gnome-shell/extensions/retoma-focus@retoma.local/`), copies only on confirm, then shows: step 2 "Log out and back in (GNOME loads new extensions at login)", step 3 button "Check again" which re-probes and, if present but disabled, shows the exact command `gnome-extensions enable retoma-focus@retoma.local` with a copy button. Main process only; renderer gets results over IPC.
6. **LIVE.md** (<= 1 page, English): exact manual steps (install helper, log out/in, enable, toggle Live), how to verify (move between apps, step away 5 min or set Away after 2), how to remove (`gnome-extensions disable ...` and delete the folder), what is recorded, and the honest limits.
7. Visual quality per MOTION-BIBLE: mode switch with a sliding indicator, crossfade between Demo and Live views, status chip pulse; dark AND light themes.

## Acceptance (never delete or weaken an assertion; add new ones)
1. Mode persists across restart (electron-smoke, with a temp userData dir) and defaults to Demo.
2. In Live with a fake focus/idle source injected through an env var `RETOMA_LIVE_FAKE=path.json` (a scripted timeline of focus/idle samples), the app shows the Now line, builds the timeline, shows the resume card after the scripted away, and the card has "Got it" (not "Resume").
3. Titles OFF by default: with the fake source emitting titles, none appear in the renderer DOM, in events.json, or in notifications; ON: truncated to 60.
4. Blocklisted app renders as "Private app" everywhere.
5. Installer: with a temp HOME, "Install helper" without confirm copies nothing; with confirm copies exactly the 2 extension files; the enable command text is correct.
6. Status chip reflects ready / extension-missing / paused. No console errors in either mode, either theme. Token test still passes in both themes.
7. Screenshots (Live view dark+light, setup card, resume card in Live) in shots/ and you LOOKED at them.
## Boundaries
Never: enable extensions yourself, touch the real ~/.local (use temp HOME in tests), add npm deps, use pkill, record anything outside the settings. Commit "desktop: live mode ui". Then `mkdir -p .stage && touch .stage/L2-live-ui`. Report <= 8 lines.
