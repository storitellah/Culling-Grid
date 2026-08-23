# Culling Grid — BURST_CULLER

A fast, keyboard-driven photo culling tool for burst photography. Import a
folder of frames, rate and flag your picks, pixel-peep at 100%, compare two
candidates side-by-side with synchronized panning, and export your selects as
a plain filename list you can paste into Lightroom or a shell script.

Everything runs locally in the browser — images are read via object URLs and
never uploaded anywhere.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

## Usage

1. Click **Import Burst Folder** (or drag-and-drop image files onto the
   viewport) to load a set of frames.
2. Step through frames and rate/flag them with the keyboard.
3. Click **Export LR Selects** to download a `.txt` list of every rated or
   flagged frame's filename.

### Views

- **Grid [G]** — contact-sheet overview of the whole burst.
- **Loupe [E]** — single-frame view; press **Space** to toggle 100% zoom and
  move the mouse to pan.
- **Compare [C]** — the selected frame next to the following frame, with
  synchronized zoom and panning to spot the sharpest shot in a burst.

### Keyboard shortcuts

| Key      | Action                          |
| -------- | ------------------------------- |
| `1`–`5`  | Set star rating                 |
| `0`      | Clear rating                    |
| `P`      | Pick (flag) the current frame   |
| `U`      | Unflag the current frame        |
| `→` / `J`| Next frame                      |
| `←` / `K`| Previous frame                  |
| `Space`  | Toggle 100% zoom                |
| `G`      | Grid view                       |
| `E`      | Loupe view                      |
| `C`      | Compare view                    |

## Tech stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [lucide-react](https://lucide.dev/) icons
