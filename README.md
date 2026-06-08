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
