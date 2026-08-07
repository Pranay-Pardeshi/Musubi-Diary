# Musubi Diary - Project State & Summary

## Current Status (Paused)
The diary web app is currently fully functional with the following major features and fixes implemented:
- **Codebase Split**: The monolithic `index.html` was successfully split into `style.css` and `script.js`.
- **Developer Mode**: `DEV_MODE = true` in `script.js` bypasses authentication and directly logs into a mock paired account (`dev@musubi.test` with `coupleId: DEV666`) to allow instant testing of paired features.
- **Performance Optimizations**: Added a `.perf-low` CSS block that disables expensive operations (`backdrop-filter` and heavy `box-shadow`) on low-end Android devices to guarantee 60fps scrolling.
- **UI Responsiveness**: 
  - Fixed laptop media player overflowing by adding `overflow-y: auto`.
  - Redesigned the desktop mini player to a sleek "Floating Island" at the bottom right.
  - Fixed the "Hide to Floating Box" feature by enforcing `!important` tags on `.floating-mode` to override the desktop styles.
- **Server Environment**: Added `run_server.bat` to launch a Python HTTP server to bypass CORS issues with Firebase and YouTube APIs.

## Next Steps When Resuming
- Double-check all Firebase permissions (specifically the 30-day test mode expiration on Firestore rules) if entries fail to save.
- Thoroughly test the real-time syncing of the "Spectator Mode" feature on multiple devices.
- Review and refine any remaining mobile layout quirks.
- When ready for production, set `const DEV_MODE = false;` in `script.js` to restore the lock screen and pairing flows.
