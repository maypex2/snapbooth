# SnapBooth — Project Memory

> Keep this file updated whenever features are added, changed, or removed.

---

## 1. Project Overview

| Key | Value |
|-----|-------|
| **Name** | SnapBooth |
| **URL** | snapbooth.app |
| **Purpose** | Free in-browser photo booth — strips, polaroids, GIFs |
| **Target audience** | Filipino teens, global social-media users |
| **Monetization** | Google AdSense + Ezoic ad slots |
| **Tech stack** | 100% Vanilla HTML / CSS / JS — no frameworks, no build step |

---

## 2. File Structure

```
snapbooth/
├── index.html          Landing page — hero, features, CTA
├── app.html            Main photo booth app
├── about.html          About page
├── privacy.html        Privacy Policy
├── terms.html          Terms of Service
├── contact.html        Contact page
├── CLAUDE.md           This file — project memory
│
├── css/
│   ├── style.css       All app styles (variables, layout, camera, pills, responsive)
│   ├── landing.css     Landing page styles
│   └── app-footer.css  Shared footer for app.html
│
├── js/
│   ├── app.js          Core: camera states, sessions, strip builder, download/share
│   ├── filters.js      FILTER_CSS map, setFilter(), applyFilterToCanvas()
│   ├── frames.js       FRAMES array, initFrames(), drawFrameDecorations(), getFrameBg()
│   ├── stickers.js     STICKERS array (30 emoji), initStickers(), drag-and-drop
│   └── landing.js      Landing page interactions
│
└── assets/
    ├── sample.jpg      Filter preview thumbnail (replace with quality photo)
    ├── frames/         Frame overlay images (placeholder — currently unused)
    └── stickers/       Sticker images (placeholder — emoji used instead)
```

**Script load order in app.html matters:** `filters.js` → `frames.js` → `stickers.js` → `app.js`

---

## 2b. App Layout Structure (post-redesign 2026-04-27)

```
app.html body
├── .ad-slot--top
├── header (sticky)
├── .app-layout  (grid: 192px left sidebar + 1fr center)
│   ├── aside.templates-sidebar   ← frame/template selector (vertical scroll)
│   │   └── #frames-grid          ← populated by initFrames()
│   └── main.center-column
│       ├── .filters-row          ← 7 filter circle thumbs (ABOVE camera)
│       ├── #cam-wrap             ← camera (aspect-ratio: 4/3, hero element)
│       ├── .layout-section       ← ← arrow + .layout-scroll + → arrow
│       │   └── .layout-card × 9  ← real Unsplash photos in each layout shape
│       ├── .capture-zone         ← #snap-btn (btn-primary) + #retake-btn
│       ├── .bottom-actions       ← Stickers btn + View Strip btn
│       └── .ad-slot--inline
├── .strip-panel#strip-panel      ← fixed right slide-out, open/close via JS
│   ├── strip-panel-header
│   ├── strip-panel-body → #strip-wrap → #strip-canvas / #gif-result
│   └── strip-panel-footer → #download-btn, #share-btn, Add Stickers btn
├── .strip-backdrop#strip-backdrop ← click to close strip panel
├── .modal-overlay#stickers-modal  ← stickers popup
│   └── .modal-box → .stickers-grid#stickers-grid  ← populated by initStickers()
├── #toast
└── footer.app-footer
```

Key JS functions added/changed:
- `setMode(m)` selects `.layout-card` (was `.layout-pill`)
- `setButtonState(has)` auto-opens strip panel when photos ready
- `openStripPanel() / closeStripPanel()` — strip slide-out
- `openStickersModal() / closeStickersModal()` — sticker picker modal
- URL param: `app.html?mode=<id>` pre-selects a layout on load

---

## 3. Features Built ✅

### Camera
- ✅ Idle placeholder on first load (no permission requested until user acts)
- ✅ Permission requested when user clicks "Take Photos" for the first time
- ✅ Auto-start camera for returning users whose permission is already granted
- ✅ Loading state with spinner ("Starting camera…")
- ✅ Error state: "Camera access was denied" + "Try again" button + help text
- ✅ Smooth fade-in of live preview once permission is granted

### Layout Modes (9 total)
- ✅ **4-Cut Strip** — 4 photos stacked vertically
- ✅ **2-Cut Strip** — 2 photos stacked (quick couples format)
- ✅ **6-Cut Grid** — 2×3 contact sheet (6 photos)
- ✅ **3-Cut Horizontal** — 3 photos side-by-side (panorama / IG story)
- ✅ **Square Collage** — 2×2 grid (4 photos, IG-post ready)
- ✅ **Single Shot** — one framed photo
- ✅ **Polaroid** — white-border single shot with SnapBooth + date caption
- ✅ **Photo Card** — instax mini style, wide white border + date caption
- ✅ **GIF / Boomerang** — 2s recording at 12fps, encoded via gif.js, boomerang loop

### Filters (7)
- ✅ None, B&W, Vintage, Retro, Glow, Warm, Cool
- ✅ Live preview thumbnails on sample.jpg (cache-busted on load)

### Frames (9)
- ✅ Strip, Classic, Minimal, Heart, Valentine, Holiday, Birthday, Graduation, New Year
- ✅ Each has custom bg colour + drawFrameDecorations() (emoji corners, text branding)

### Stickers
- ✅ 30 emoji stickers across categories (hearts, food, nature, faces, etc.)
- ✅ Click to add; drag-and-drop to reposition on strip canvas
- ✅ Persisted as `{ emoji, x, y, size }` normalised to canvas fraction

### UI
- ✅ Scrollable horizontal layout pill bar with SVG layout icons
- ✅ Active pill shows pink fill + shot-count badge (e.g. "6 shots")
- ✅ Shot counter dots updating in real time during capture sequence
- ✅ Flash effect on capture, recording ring during session
- ✅ GIF encode progress bar (shown over camera during encoding)
- ✅ Mode-specific download filenames (`snapbooth-6cut-grid-…png`, etc.)
- ✅ Download PNG / GIF
- ✅ Web Share API with clipboard fallback
- ✅ Toast notifications (2.6s auto-dismiss)
- ✅ Retake + Clear buttons
- ✅ Strip fade-in animation when ready

### App UI Redesign (2026-04-27)
- ✅ New 2-column layout: left templates sidebar + center main column
- ✅ Filters row moved ABOVE camera with round circle thumbs, dark ring on active
- ✅ Camera aspect-ratio changed from 4:5 to 4:3 (wider than tall)
- ✅ Templates sidebar: vertical scroll list of frame styles as horizontal card rows
- ✅ Layout selector: horizontal scroll with ← → arrow buttons, real Unsplash photos in each layout shape
- ✅ Layout card labels: lowercase when inactive, UPPERCASE when active
- ✅ Capture button: cream embossed pill, DM Serif Display, centered
- ✅ Retake: small uppercase text link, shows only when photos exist
- ✅ Stickers: moved to popup modal (was right sidebar grid)
- ✅ Photo strip: moved to fixed right slide-out panel, auto-opens after capture
- ✅ Strip panel has close button + backdrop overlay
- ✅ SVG stickers from /assets/stickers/ connected and rendered as <img> in modal
- ✅ Right sidebar removed entirely
- ✅ URL param `?mode=<id>` pre-selects layout (for landing page links)
- ✅ "View Strip" button appears after capture to re-open closed panel
- ✅ Responsive: tablet → sidebar becomes horizontal scroll; mobile → stacked

### Landing Page Formats Section (2026-04-27)
- ✅ New "Choose your format" section between hero and features
- ✅ 8 layout preview cards with real Unsplash portrait photos arranged in each layout shape
- ✅ Each card links to `app.html?mode=<id>` (pre-selects that layout)
- ✅ Horizontal scroll on mobile, wrapping grid on desktop

### Pages & SEO
- ✅ Landing page — hero, feature grid, CTA
- ✅ Open Graph + Twitter Card meta on all pages
- ✅ Privacy Policy, About, Contact, Terms pages
- ✅ Canonical URLs set

### Ads
- ✅ AdSense placeholder slots: top banner, in-content, sidebar
- ✅ Slots commented out — ready for real publisher ID + slot IDs

### Responsive
- ✅ 900px breakpoint — stacked single-column layout
- ✅ 768px breakpoint — tighter padding, 4-col frames grid
- ✅ 480px breakpoint — compact pills, smaller camera, full-width buttons

---

## 4. Features To Build Next 📋

### Launch blockers
- 📋 Deploy to Netlify — connect GitHub repo, add custom domain `snapbooth.app`
- 📋 Replace AdSense placeholder comments with real `ca-pub-XXXX` + slot IDs
- 📋 Add `assets/og-image.jpg` (1200×630) for social sharing previews
- 📋 Add `favicon.ico` + Apple touch icon
- 📋 Add `sitemap.xml` and `robots.txt`

### UX improvements
- 📋 Countdown timer option in UI (3s / 5s / 10s selector)
- 📋 Mirror toggle button (un-mirror the live preview)
- 📋 Caption input on Polaroid / Photo Card (user types custom text)
- 📋 Strip background colour picker (replace frame bg with custom colour)
- 📋 Print button — `window.print()` with print-only strip layout

### Growth
- 📋 Analytics — Google Analytics or Plausible
- 📋 Performance — lazy-load sidebar sections below the fold
- 📋 PWA manifest so users can "Add to Home Screen"

---

## 5. Design System

### CSS Variables (`css/style.css`)
```css
--bg:       #0e0e0f      /* dark app background */
--surface:  #18181b      /* cards, cam-wrap, strip-wrap */
--surface2: #222226      /* mode bar, filter buttons */
--border:   rgba(255,255,255,0.08)
--border2:  rgba(255,255,255,0.14)
--text:     #f0efe8      /* primary text */
--muted:    #8a8a8e      /* labels, hints */
--accent:   #e8c4a0      /* gold/cream — primary CTA colour */
--accent2:  #c9a87c      /* accent hover */
--pink:     #f2b8c6      /* layout pill active state */
--teal:     #7ecec4      /* reserved for future use */
--radius:   16px
--radius-sm: 10px
```

### Camera idle overlay colours (hardcoded, not CSS vars)
```
bg gradient: #fdf6f0 → #fce8ee  (cream → blush pink)
icon/text:   #c06070 / #5a2535 / #a06070
```

### Fonts
- **Headings / logo:** `DM Serif Display` (italic for logo `<span>`)
- **Body / UI:** `DM Sans` (weight 300 / 400 / 500)
- Loaded from Google Fonts with `display=swap`

### Key animations
| Name | Used for |
|------|----------|
| `fadeDown` | Header entrance |
| `fadeUp` | Camera panel + sidebar entrance |
| `pulse` | Recording ring (active capture) |
| `camPulse` | Camera icon on idle overlay |
| `camSpin` | Spinner on loading overlay |

---

## 6. Coding Conventions

- **Vanilla only** — no React, Vue, TypeScript, or build tools
- **No modules** — all JS is global; load order matters (see §2)
- **Single-file HTML pages** with linked CSS/JS files in `css/` and `js/`
- **Mobile-first** responsive with `max-width` breakpoints: 900 / 768 / 480px
- **One external CDN dep:** gif.js 0.2.0 for GIF encoding
- Comments only for non-obvious WHY — not for what the code does
- Keep `buildStrip()` geometry self-contained per mode (no shared layout helpers)
- `applyFilterToCanvas()` lives in `filters.js` and operates on `canvas` directly
- `drawFrameDecorations()` receives `sctx, frameId, sw, sh` — no global state

---

## 7. Known Issues

- [ ] `assets/sample.jpg` is a low-quality placeholder — filter thumbnails look rough until replaced
- [ ] `assets/frames/` is empty — `drawFrameDecorations()` draws with canvas only (no image overlays)
- [ ] 6-cut grid and 3-cut horizontal produce very large canvases (~1300×1500px) — no per-slot downscaling yet
- [ ] `navigator.permissions.query({ name: 'camera' })` not supported in all browsers (Firefox <116) — falls back gracefully to idle placeholder
- [ ] GIF encode blocks the main thread slightly on slow devices during the `gif.render()` phase

---

*Last updated: 2026-04-28*

---

## 8. UI Redesign 2026-04-28 (Tailwind)

Major restructure. `app.html` and new `customize.html` use **Tailwind via CDN** (no build step). `css/style.css`, `css/app-footer.css`, and `js/stickers.js` no longer load on `app.html`.

**New flow:**
1. `app.html` — minimal camera page. No templates sidebar, no stickers button. Filters row above camera, big 4:3 camera card, layout scroller, single Capture button.
2. After capture, a centered modal preview shows the strip with three actions: **Customize Photo** (→ customize.html), Download PNG, Share. Plus Retake link.
3. `customize.html` — new dedicated page. Left = live strip preview canvas. Right = tabbed sidebar with **Frame** / **Color** / **Stickers**. Color tab includes preset swatches + native color picker for any custom background. Stickers can be clicked to add and dragged on canvas to reposition. Footer has Download PNG + Share.

**Data hand-off:** `sessionStorage.sb_shots` (data-URL array), `sb_mode`, `sb_filter`. Set by `goCustomize()` in app.js, read by `loadShots()` in customize.js.

**New / changed files:**
- `app.html` — full rewrite, Tailwind classes only
- `js/app.js` — removed sidebar / sticker / strip-panel logic; added `goCustomize()`, `openPreview()`, `closePreview()`
- `customize.html` — new page
- `js/customize.js` — new; clones `buildStrip` logic, handles bg-color override, sticker drag

**Color palette (Tailwind config inline):** cream `#FAF6EE`, cream2 `#F3ECDD`, sand `#E8DCC4`, ink `#2A2520`, accent `#C9A07A`, accentd `#8B6F47`.

Landing page (`index.html`) was intentionally **not** changed.
