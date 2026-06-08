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

## Installation

Download the latest installer from the [releases page](https://github.com/heiwin/Buccaneer/releases).

| OS      | Package         | Install                                   |
| ------- | --------------- | ----------------------------------------- |
| macOS   | `.dmg`          | Open the DMG and drag the app to **Applications**.<br>On first launch, right-click the app and select **Open** (unsigned app). |
| Windows | `.msi`          | Double-click the MSI and follow the wizard. |
| Linux   | `.deb` / `.AppImage` | Install via your package manager or run the AppImage directly. |

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
