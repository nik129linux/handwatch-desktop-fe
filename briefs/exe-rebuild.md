# Brief: rebuild the Windows installer (Retoma Setup 1.0.0.exe)

Goal: a fresh `dist/Retoma Setup 1.0.0.exe` built from the current commit, with the app key inside.
Touch nothing in the source. Do not commit. Do not print, cat or log the contents of ai/app-key.json.

Steps:
1. Stop if `ai/app-key.json` is missing: report "ai/app-key.json missing" and do nothing else.
2. `node tests/app-key.test.js` and `node tests/acceptance.js` must pass first.
3. `npm run dist:win` (electron-builder under wine, as before). If it fails, report the last 30 lines of output; do not change package.json.
4. Prove it: `ls -la dist/*.exe` shows a new timestamp, and `npx asar list dist/win-unpacked/resources/app.asar | grep -E "ai/(providers|app-key)"` lists both ai/providers.js and ai/app-key.json.
   Also `npx asar extract-file dist/win-unpacked/resources/app.asar ai/providers.js` then `grep -c serverHeaders providers.js` > 0, and delete the extracted file.
Report (max 6 lines): exe size + timestamp, the asar listing lines, any warning.
