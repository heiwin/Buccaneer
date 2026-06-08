# Buccaneer

**Buccaneer** is a modern, high-performance desktop application for discovering, streaming, and downloading movies and TV shows via BitTorrent. Built on **Tauri v2**, it combines a React frontend with a native Rust backend for a lightweight, secure, and fast experience.

---

## Tech Stack

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| **Frontend** | React 19, TypeScript 6, Vite 8, Tailwind CSS 3, React Router 7            |
| **Backend**  | Rust, Tauri v2 (2.11), librqbit 8.1.1 (torrent engine), reqwest, tokio    |
| **Torrents** | [librqbit](https://github.com/ikatson/rqbit) — embedded BitTorrent engine  |
| **Icons**    | Lucide React                                                              |
| **Animation**| Motion (Framer Motion v12)                                                |
| **Styling**  | Tailwind CSS with custom zinc/gray palette                                |
| **Persistence** | Tauri plugin-store (settings, favorites, watched history)              |

---

## Features

- **Search Torrents** — Query multiple trackers simultaneously via the Knaben API (1337x, The Pirate Bay, YTS, Nyaa.si), with automatic fallback to apibay.org. Also supports dedicated YTS (movies) and EZTV (TV series) search sources.
- **Stream with VLC** — Auto-detect VLC on macOS, Windows, or Linux, then hand off the stream URL with optimized network caching (10 s pre-buffer).
- **Download Torrents** — Full download management with pause, resume, and remove (with or without file deletion). Optional file selection before downloading or streaming.
- **TMDB Integration** — Fetch trending movies and TV series (this week), view rich details (cast, trailers, genres, runtime, ratings), and browse a full cast gallery.
- **Seasons & Episodes Browser** — For TV series, browse seasons and episodes with an episode-by-episode view. Mark individual episodes as watched. Quick-search any season or episode across torrent sources.
- **Discover** — Explore movies and TV by genre, release year, rating threshold, original language, and streaming platform (Netflix, Disney+, Apple TV+, etc.).
- **Home Page Trending** — Trending movies and TV series carousels + streaming provider section showing what's available on each platform.
- **Inline TMDB Search** — Search TMDB directly from the home page to quickly navigate to any movie or TV show.
- **Favorites** — Save titles to a persistent favorites list with Tauri store.
- **Watch Tracking** — Mark movies or individual TV episodes as watched (persisted across sessions).
- **Library Persistence** — Favorites and watch history survive app restarts via `@tauri-apps/plugin-store`.
- **Settings** — Configure TMDB API key, VLC path (auto-detect or manual), default download folder, download/upload speed limits, search filters (hide unsafe, hide adult content), streaming providers to show on the home page, and streaming folder cleanup behavior.
- **Deep Links** — Support for `buccaneer://` deep link protocol.
- **Crash Recovery** — On startup, orphaned streaming directories are cleaned up and stale torrent entries (whose output folders no longer exist) are removed.
- **Graceful Shutdown** — Confirms with the user when active downloads are in progress; optionally clears all streamed files on exit.

---

## Architecture Overview

```
Buccaneer/
├── src/                          # React frontend
│   ├── App.tsx                   # Root component: routing, close dialog, deep link listener
│   ├── main.tsx                  # Entry point (BrowserRouter, StrictMode)
│   ├── index.css                 # Tailwind directives + custom scrollbar styles
│   │
│   ├── pages/                    # Page-level components
│   │   ├── HomePage.tsx          # Trending movies & TV, streaming providers, inline TMDB search
│   │   ├── DetailPage.tsx        # TMDB details + torrent results + season/episode browser
│   │   ├── SearchPage.tsx        # Free-form torrent search with source/quality/language filters
│   │   ├── DiscoverPage.tsx      # Filtered TMDB discovery (genre, year, rating, language, platform)
│   │   ├── DownloadsPage.tsx     # Active torrent list with pause/resume/remove/stream + progress
│   │   ├── FavoritesPage.tsx     # Favorited movies & TV (persisted)
│   │   └── SettingsPage.tsx      # All user-configurable settings
│   │
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Primitives (Button, Input, Select, Modal, Toggle, Badge, etc.)
│   │   ├── Sidebar.tsx           # App navigation sidebar
│   │   ├── Carousel.tsx          # Horizontal scrollable carousel
│   │   ├── MediaCard.tsx         # Poster card with favorite/watched toggle
│   │   ├── TorrentList.tsx       # Torrent results with quality/language/provider filters
│   │   ├── TorrentRow.tsx        # Individual torrent result row with expandable files
│   │   ├── TorrentActionMenu.tsx  # Modal for download vs stream with VLC
│   │   ├── FileSelectionList.tsx  # File picker for multi-file torrents
│   │   ├── EmptyState.tsx        # Empty state placeholder
│   │   └── index.ts              # Barrel exports
│   │
│   ├── api/                      # Tauri invoke wrappers
│   │   ├── tmdb.ts               # TMDB API calls (trending, details, discover, genres, search)
│   │   ├── knaben.ts             # Torrent search + formatBytes utility
│   │   ├── torrent.ts            # Torrent lifecycle, VLC auto-detect & streaming, metadata
│   │   ├── settings.ts           # Persistent settings via plugin-store
│   │   └── library.ts            # Favorites & watched persistence
│   │
│   ├── hooks/
│   │   └── useTorrentFileSelection.ts  # Torrent file metadata & selection state
│   │
│   ├── lib/
│   │   ├── LibraryContext.tsx     # React context for favorites/watched with auto-save (500ms debounce)
│   │   └── utils.ts              # cn() helper (clsx + tailwind-merge)
│   │
│   ├── types/
│   │   ├── tmdb.ts               # TMDB response types (MovieDetails, TvDetails, CastMember, etc.)
│   │   └── knaben.ts             # Torrent result types + allowed tracker list
│   │
│   └── constants/
│       ├── filters.ts            # Quality/language filter options & query builder
│       └── streaming.ts          # Streaming provider IDs (Apple TV+, Netflix, etc.) + region list
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point (hides console on Windows release)
│   │   ├── lib.rs                # App setup: TMDB commands, search commands, librqbit session init
│   │   ├── torrent.rs            # TorrentState management, lifecycle, rate limits, metadata
│   │   └── vlc.rs                # VLC auto-detection per platform + stream launching
│   ├── capabilities/
│   │   └── default.json          # Tauri v2 capability permissions
│   ├── tauri.conf.json           # Tauri configuration (CSP, window, deep link, bundles)
│   └── Cargo.toml                # Rust dependencies
│
├── package.json                  # Node dependencies & scripts
├── vite.config.ts                # Vite configuration (React plugin, @ alias)
├── tailwind.config.js            # Tailwind theme (custom colors, fonts)
├── tsconfig.json                 # TypeScript configuration
├── tsconfig.app.json             # App-specific TS config
├── tsconfig.node.json            # Node-specific TS config
├── eslint.config.js              # ESLint flat config
└── postcss.config.js             # PostCSS (Tailwind + autoprefixer)
```

### Frontend (`src/`)

- All TMDB and Knaben/torrent network requests are proxied through the Rust backend via `@tauri-apps/api/core` `invoke()` calls. No direct HTTP calls are made from the frontend.
- TMDB responses are cached in-memory for **10 minutes** to reduce API calls and improve navigation speed.
- The torrent search supports quality (2160p, 1080p, 720p), language (English, Italian, Spanish, French), and source (Knaben, APIBay, YTS, EZTV) filters.
- Streaming providers are configurable: users can select which platforms (Netflix, Apple TV+, Disney+, etc.) to show on the home page, per region.

### Backend (`src-tauri/src/`)

| File          | Responsibilities                                                                 |
| ------------- | -------------------------------------------------------------------------------- |
| `lib.rs`      | Tauri app setup, plugin registration, TMDB commands, `search_torrents` (Knaben + apibay/YTS/EZTV fallback), librqbit session initialization, exit cleanup logic |
| `torrent.rs`  | `TorrentState` (managed state), torrent lifecycle (add/pause/resume/remove), rate limits via HTTP API, active torrent polling with stats merging, metadata listing |
| `vlc.rs`      | Platform-specific VLC auto-detection and stream launching with `--network-caching=10000` |
| `main.rs`     | Binary entry point (hides console on Windows release builds)                     |

---

## Setup & Development

### Prerequisites

- **Node.js** (v20+) and npm
- **Rust** toolchain (`rustc` + `cargo`) — minimum rust-version 1.77.2
- **VLC media player** (for streaming playback)

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd Buccaneer

# 2. Install frontend dependencies
npm install

# 3. (Optional) Verify Rust toolchain
cargo --version
```

### Running in Development

```bash
# Start the full Tauri development environment
# (Vite dev server + Rust compilation + native window)
npm run tauri dev
```

This launches a native desktop window with hot-reload for both the React frontend and the Rust backend.

### Production Build

```bash
npm run tauri build
```

The bundled application will be placed in `src-tauri/target/release/bundle/`.

### Automated Builds (GitHub Actions)

This repository includes a GitHub Actions workflow (`.github/workflows/release.yml`) that automatically builds Buccaneer for **macOS**, **Windows**, and **Linux** whenever you push a version tag.

**To create a release:**

```bash
git tag v1.0.0
git push --tags
```

GitHub will then:
1. Spin up three build machines (Ubuntu, macOS, Windows)
2. Install Rust + Node.js automatically
3. Build the native binary for each platform
4. Create a **draft GitHub Release** with all three installers attached

You can then publish the release from the GitHub web interface.

> **Note:** The built installers are fully self-contained. End users **do not need** Rust, Node.js, or any development toolchain — they simply download and open the file.

> **⚠️ macOS users:** Since the app is not signed with an Apple Developer certificate, macOS may show _"Buccaneer cannot be opened because the developer cannot be verified."_ To open it anyway:
> - **Right-click** the `.dmg` / `.app` and select **Open**
> - Or go to **System Settings → Privacy & Security** and click **Open Anyway**
>
> This is normal for unsigned apps and applies to all open-source software distributed outside the Mac App Store.

---

## Development Commands

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Start Vite dev server only (no Tauri window)   |
| `npm run build`      | TypeScript check + Vite production build       |
| `npm run lint`       | Run ESLint on the entire project               |
| `npm run preview`    | Preview the Vite production build              |
| `npm run tauri dev`  | Full Tauri development mode (frontend + Rust)  |
| `npm run tauri build`| Production bundle                              |
| `cargo check`        | Rust compile check (without producing binary)  |
| `cargo build`        | Full Rust debug build                          |

---

## Configuration

### Tauri Configuration (`src-tauri/tauri.conf.json`)

| Setting            | Value                                             |
| ------------------ | ------------------------------------------------- |
| App identifier     | `com.buccaneer.dev`                              |
| Version            | `0.1.0`                                           |
| Window size        | 1280 × 800 (min 900 × 600, resizable)             |
| Frontend dev URL   | `http://localhost:5173`                            |
| Deep link scheme   | `buccaneer://`                                     |

### Content Security Policy

```json
{
  "csp": "default-src 'self'; img-src 'self' https://image.tmdb.org https://placehold.co; connect-src 'self' http://127.0.0.1:3030 https://api.themoviedb.org https://api.knaben.org https://apibay.org; style-src 'self' 'unsafe-inline'; font-src 'self' data:"
}
```

- **`connect-src`**: Allows connections to the local librqbit HTTP API (`127.0.0.1:3030`), TMDB, Knaben, and the apibay fallback.
- **`img-src`**: Allows TMDB image CDN and `placehold.co` for poster/profile image fallbacks.

### Tauri Capabilities (`src-tauri/capabilities/default.json`)

| Permission                         | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `core:default`                     | Core Tauri APIs                               |
| `core:window:allow-destroy`        | Programmatic window close                     |
| `shell:allow-open`                 | Open external URLs (IMDb, YouTube) only        |
| `store:allow-{load,set,get,save}`  | Persistent settings & library storage          |
| `dialog:default`                   | Native file dialogs (file/folder pickers)      |

---

## Key Design Decisions

1. **Backend-proxied network requests** — All TMDB, Knaben, apibay, YTS, and EZTV requests go through the Rust backend, not the frontend. This keeps API keys secure and allows server-side tracker filtering.

2. **Embedded librqbit HTTP API** — librqbit runs an HTTP API on `127.0.0.1:3030` inside the app process. The frontend communicates with it via Tauri commands that internally use the librqbit Rust API.

3. **Multi-source search** — The primary search source is the Knaben API (results filtered to 1337x, The Pirate Bay, YTS, Nyaa.si). If Knaben returns empty results or errors, it falls back to apibay.org (The Pirate Bay mirror). Dedicated YTS and EZTV sources are also available for movie and TV-series-specific searches.

4. **In-memory TMDB cache** — TMDB responses are cached for 10 minutes using a simple in-memory Map. This prevents redundant API calls and improves perceived performance.

5. **Streaming via VLC** — Rather than building a custom video player, Buccaneer hands off streaming URLs to VLC. This avoids complex transcoding and supports a wide range of formats (MKV, AVI, etc.) with advanced audio codec support.

6. **Graceful exit** — On close, the app checks for active torrents and prompts the user. On forced exit, it cleans up streaming files (unless disabled in settings). librqbit's persistence saves torrent state to disk so ongoing downloads resume after restart.

7. **Persistent state via plugin-store** — Settings, favorites, and watched history are persisted via `@tauri-apps/plugin-store` as JSON files in the app data directory. Library state auto-saves with a 500 ms debounce.

8. **Shared HTTP client** — A single `reqwest::Client` is reused across all backend HTTP requests for connection pooling and TLS session reuse.

---

## Rust Dependencies (Cargo.toml)

| Dependency              | Version  | Purpose                                      |
| ----------------------- | -------- | -------------------------------------------- |
| `tauri`                 | 2.11.2   | Desktop app framework                        |
| `librqbit`              | 8.1.1    | BitTorrent engine (with `http-api` feature)  |
| `reqwest`               | 0.12     | HTTP client for TMDB / Knaben / apibay       |
| `tokio`                 | 1.52     | Async runtime                                 |
| `serde` / `serde_json`  | 1.0      | Serialization                                 |
| `tauri-plugin-shell`    | 2        | Opening external URLs (browser)               |
| `tauri-plugin-store`    | 2        | Persistent key-value storage                  |
| `tauri-plugin-dialog`   | 2        | Native file dialogs                           |
| `tauri-plugin-deep-link`| 2        | `buccaneer://` deep link support              |
| `tauri-plugin-log`      | 2        | Logging (debug builds only)                   |
| `directories`           | 6.0      | Platform-specific user directories            |
| `chrono`                | 0.4      | Timestamp formatting                          |
| `urlencoding`           | 2        | URL encoding for magnet links                 |

## Frontend Dependencies (package.json)

| Package                          | Version   | Purpose                                      |
| -------------------------------- | --------- | -------------------------------------------- |
| `react` / `react-dom`            | 19.2      | UI framework                                  |
| `react-router-dom`               | 7.17      | Client-side routing                           |
| `@tauri-apps/api`                | 2.11      | Tauri IPC (invoke, window, event)             |
| `@tauri-apps/plugin-store`       | 2.4       | Persistent storage                            |
| `@tauri-apps/plugin-dialog`      | 2.7       | Native file dialogs                           |
| `@tauri-apps/plugin-deep-link`   | 2.4       | Deep link handling                            |
| `lucide-react`                   | 1.17      | Icon set                                      |
| `motion`                         | 12.40     | Animation library (Framer Motion)             |
| `clsx` / `tailwind-merge`        | —         | Conditional CSS class merging                 |
| `typescript`                     | 6.0       | TypeScript compiler                           |
| `vite`                           | 8.0       | Build tool & dev server                       |
| `tailwindcss`                    | 3.4       | Utility-first CSS                             |
| `@vitejs/plugin-react`           | 6.0       | Vite React plugin                             |
| `eslint`                         | 10.4      | Linting                                       |
| `typescript-eslint`              | 8.61      | TypeScript ESLint                             |

---

## License

MIT — see the `LICENSE` file for details.

---

> **⚠️ Legal Disclaimer**
>
> Buccaneer is **built solely for educational and study purposes**. It is a personal project created to explore and demonstrate the technical capabilities of Tauri v2, React, and Rust — specifically around embedded BitTorrent engines, media streaming, and cross-platform desktop application architecture.
>
> The author **does not condone, encourage, or promote** piracy, copyright infringement, or any illegal activity. This software is not intended to be used for the unauthorized distribution or downloading of copyrighted material.
>
> **The author is not responsible** for the ways in which this software is used. Users assume all responsibility for ensuring that their use of Buccaneer complies with all applicable local, national, and international laws regarding copyright, torrenting, and digital media.
>
> By using or downloading this software, you acknowledge that:
> - You understand and agree to this disclaimer.
> - You will only use Buccaneer to access content that you have the legal right to access.
> - You are solely responsible for any legal consequences arising from your use of the software.
