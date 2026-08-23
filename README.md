<div align="center">

<img src="public/icons/icon-192.png" alt="Culling Grid" width="96" height="96" />

# Culling Grid

### by Storitellah

**The fastest way to cull a shoot. RAW-ready. 100% local. Lightroom-friendly.**

[**▶ Launch the app — cullinggrid.pages.dev**](https://cullinggrid.pages.dev/)

<sub>Built for photojournalists, photo editors, and commercial photographers who shoot in bursts and cull against the clock.</sub>

![Local first](https://img.shields.io/badge/data-100%25_local-30d158)
![RAW](https://img.shields.io/badge/RAW-CR2·CR3·NEF·ARW·RAF·RW2·DNG-0a84ff)
![PWA](https://img.shields.io/badge/PWA-installable-5e5ce6)
![License](https://img.shields.io/badge/license-MIT-8e8e93)

</div>

---

## Why Culling Grid

Culling is the least glamorous, most time-sensitive part of the job. Culling Grid
does one thing and does it fast: get you from a card full of near-identical burst
frames to a tight selection, then hand those picks off to Lightroom Classic — without
uploading a single file anywhere.

> **Your photos never leave your machine.** Everything runs in the browser. No account,
> no cloud, no upload. Close the tab and it's gone.

---

## Feature highlights

| | |
|---|---|
| ⚡ **Instant previews** | RAW frames render from their **embedded JPEGs**, pulled straight out of the file buffer. No demosaicing, no spinners — thumbnails appear as fast as the disk can read. |
| 🗂 **Universal formats** | CR2 · CR3 · NEF · ARW · RAF · RW2 · DNG · HEIC/HEIF · TIFF · JPEG · PNG. Originals are **never modified**. |
| ⭐ **Keyboard-first culling** | Star ratings, pick/reject flags, and color labels — all under your left hand while your right stays on the arrows. |
| 🔍 **Loupe & burst compare** | 100% pixel-peeping and a synchronized side-by-side compare to find the single sharpest frame in a burst. |
| 🎞 **Contact sheets** | Generate a high-resolution contact sheet of your selects and export to **PDF or PNG**. |
| 🌉 **Lightroom bridge** | Write **XMP sidecars** (ratings + color labels) that import straight into Lightroom Classic, plus a filtered picks list. |
| 💾 **Local catalog** | Save, back up, and restore culling sessions as a portable `.cgcat` file — your decisions, in a file you own. |
| 📲 **Installable PWA** | Install to the Dock or Start menu and run offline like a native app on macOS and Windows. |

---

## The culling loop

```
   Import  ──►  Rate / Pick / Label  ──►  Compare bursts  ──►  Export
  (drag &        (1–5 · P · X · 6–9)      (Loupe · A|B)        (XMP · Contact
   drop)                                                        sheet · Catalog)
```

Drop a card's worth of frames, blast through them on the keyboard, resolve the
tight calls in Compare, then export selects to Lightroom. That's the whole app.

---

## Keyboard shortcuts

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `1`–`5` | Set star rating | | `G` | Grid view |
| `0` | Clear rating | | `E` | Loupe view |
| `6` `7` `8` `9` | Red / Yellow / Green / Blue label | | `C` | Compare view |
| `P` | Pick (flag) | | `S` | Contact sheet |
| `X` | Reject | | `Space` | Toggle 100% zoom |
| `U` | Clear pick/reject | | `←` `→` / `J` `K` | Previous / next frame |

---

## Lightroom Classic workflow

1. Cull in Culling Grid; rate and label your keepers.
2. **Export ▸ XMP sidecars** — downloads a `.zip` of `.xmp` files, one per select.
3. Unzip the sidecars **next to the matching RAW files** (same folder, same basename).
4. In Lightroom Classic: import the folder, or select the photos and
   **Metadata ▸ Read Metadata from Files**.

Star ratings (`xmp:Rating`) and color labels (`xmp:Label`) flow straight into your
catalog. Because pick/reject flags are catalog-only in Lightroom and have no XMP
field, Culling Grid also exports a **filtered picks list** you can use with a shell
(`xargs cp …`) or your OS file manager to physically separate selects.

---

## Architecture notes

Culling Grid is a static, client-side single-page app — no backend, by design.

- **Framework** — React 18 + Vite, styled with Tailwind CSS on an Apple HIG-inspired
  design system (system font stack, translucent materials, theme-aware tokens,
  reduced-motion & reduced-transparency support).
- **Preview engine** (`src/lib/decode.js`) — scans the file buffer for embedded JPEG
  streams (SOI→EOI) and lifts the largest one. This is what makes RAW previews instant.
  TIFF and TIFF-based RAW without a usable embedded preview fall back to a full
  [UTIF](https://github.com/photopea/UTIF.js) decode; HEIF/AVIF use native browser
  decoding where available.
- **Catalog** (`src/lib/catalog.js`) — culling decisions serialized to a portable
  `.cgcat` JSON, re-linked to re-imported frames by filename + size.
- **Lightroom bridge** (`src/lib/xmp.js`) — standards-compliant XMP sidecar generation,
  bundled to a zip with [JSZip](https://stuk.github.io/jszip/).
- **Contact sheets** (`src/lib/contactSheet.js`) — canvas-rendered grids exported to
  PNG, or to multi-page A4 PDF via [jsPDF](https://github.com/parallax/jsPDF).
- **PWA** — web app manifest + a network-first service worker cache the app shell for
  offline launch. Photos are never cached; they live only in page memory.
- **Privacy** — no network calls for image data, no analytics, no telemetry. Heavy
  export libraries are code-split and loaded only when you actually export.

```
src/
├── CullingGrid.jsx        # UI: grid · loupe · compare · contact sheet
├── lib/
│   ├── decode.js          # embedded-JPEG extraction + format decode
│   ├── catalog.js         # .cgcat save / restore
│   ├── xmp.js             # Lightroom XMP sidecars + picks list
│   └── contactSheet.js    # PNG / PDF contact sheets
└── main.jsx               # entry + service-worker registration
```

---

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
```

**Deployment** — any static host. This project ships on **Cloudflare Pages** with
build command `npm run build` and output directory `dist`.

---

## Format support

| Family | Formats | Method |
|---|---|---|
| RAW | CR2, CR3, NEF, ARW, RAF, RW2, DNG, ORF, PEF, SRW | Embedded JPEG preview (instant) |
| HDR / modern | HEIC, HEIF, AVIF | Native decode where the browser supports it |
| Standard | JPEG, PNG, GIF, WEBP, BMP | Native decode |
| Scans / archival | TIFF | Embedded JPEG, else full UTIF decode |

> Some formats depend on browser support (notably HEIC outside Safari). When a frame
> can't be previewed, Culling Grid marks it clearly and keeps it in the sequence so
> your culling metadata stays complete.

---

## Feedback & bug reports

Found something off? Use the **🐞 Report Bug** button in the app, or email
**[hello@storitellah.com](mailto:hello@storitellah.com)**.

---

<div align="center">
<sub>Culling Grid — by Storitellah · <a href="https://cullinggrid.pages.dev/">cullinggrid.pages.dev</a></sub>
</div>
