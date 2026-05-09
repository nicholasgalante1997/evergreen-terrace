# Spec: Tauri Native Desktop Wrapper

## Purpose

Native macOS app wrapping the existing `core/web` React dashboard. No new React code — same web dashboard, native shell. Adds system tray, native notifications, and offline-capable local file reads.

## Location

`core/desktop/` — a Tauri v2 project.

## Tech Stack

- Tauri v2 (Rust backend + WebView frontend)
- Frontend: the existing `core/web` Vite app (loaded as the WebView)
- Rust: minimal — system tray, notifications, deep links only

## Structure

```
core/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri app entry
│   │   ├── tray.rs          # System tray setup
│   │   └── commands.rs      # Tauri commands (read local TOML files)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/               # App icons
├── package.json             # Tauri CLI + dev/build scripts
└── tsconfig.json
```

## System Tray

- Icon in macOS menu bar
- Badge showing inbox item count (updated every 30s via polling)
- Menu items:
  - "Open evergreen-terrace" — focuses/opens the main window
  - "Queue: N items" — display only
  - Separator
  - "Quit"

## Native Notifications

Triggered when:
- A new p0 item enters the inbox
- Sentinel run completes with a stale project (score < 50)

Notification payload: title + body. Clicking opens the main window.

## Tauri Commands (Rust → JS bridge)

```rust
#[tauri::command]
fn read_queue_inbox(queue_root: String) -> Result<String, String>
// Reads queue/inbox/*.toml directly from disk — offline capable

#[tauri::command]
fn read_context_global(queue_root: String) -> Result<String, String>
// Reads context/global.toml directly from disk
```

These allow the frontend to read local state without the queue server running.

## Window Configuration (`tauri.conf.json`)

```json
{
  "app": {
    "windows": [{
      "title": "evergreen-terrace",
      "width": 1024,
      "height": 768,
      "minWidth": 720,
      "minHeight": 500
    }]
  },
  "bundle": {
    "identifier": "com.evergreen-terrace.app",
    "icon": ["icons/icon.icns"]
  }
}
```

## Dev Workflow

```sh
# In core/web: bun run dev (Vite on port 2728)
# In core/desktop: bun run tauri dev (opens WebView pointing at localhost:2728)
```

Production build bundles the Vite output into the app — no external server needed for the UI.

## package.json scripts

```json
{
  "dev": "tauri dev",
  "build": "tauri build",
  "clean": "rm -rf src-tauri/target"
}
```

## Acceptance Criteria

- `bun run dev` in `core/desktop/` opens a native macOS window with the web dashboard
- System tray icon appears with inbox count badge
- Clicking tray icon opens/focuses the window
- Native notification fires when a p0 item is created
- `tauri build` produces a `.app` bundle
- Offline mode: tray badge still updates when queue server is down (reads local TOML via Tauri command)
