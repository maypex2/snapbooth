// ── State ──
let currentMode  = sessionStorage.getItem('sb_mode')   || '4cut';
let currentFrame = 'white';
let bgOverride   = null;  // null | { type:'solid', color } | { type:'pattern', img }
let currentTemplate = null;  // null | template id from TEMPLATES
let stickers     = [];
let shots        = [];
// ── Background removal (AI cutout) state ──
let bgRemoveOn    = false;
let bgRemoveColor = '#FFE5EC';
// Cutouts keyed by the shot HTMLImageElement so they get GC'd when shots are
// replaced. Each value is an HTMLImageElement of a transparent-background PNG.
const cutouts     = new WeakMap();
let _bgLibPromise = null;
let _bgInflight   = 0;
let customText   = '';
let customFont   = 'serif-italic';
// Draggable position for customText overlay. Fractions of canvas (0..1).
// Default to center so text appears in the middle when first added.
let customTextPos = { x: 0.5, y: 0.5 };
// Font size as fraction of canvas width.
let customTextSize = 0.06;
// Text fill color. 'auto' = auto-contrast vs strip background; otherwise a hex.
let customTextColor = 'auto';

const TITLE_FONT_OPTIONS = [
  { id: 'serif-italic', label: 'Classic',   weight: 'italic ', family: '"DM Serif Display", serif' },
  { id: 'serif',        label: 'Editorial', weight: '700 ',    family: '"Playfair Display", serif' },
  { id: 'script',       label: 'Script',    weight: '700 ',    family: '"Dancing Script", cursive' },
  { id: 'pacifico',     label: 'Retro',     weight: '400 ',    family: '"Pacifico", cursive' },
  { id: 'fredoka',      label: 'Bubbly',    weight: '600 ',    family: '"Fredoka", sans-serif' },
  { id: 'bebas',        label: 'Bold',      weight: '400 ',    family: '"Bebas Neue", sans-serif' },
  { id: 'sans',         label: 'Modern',    weight: '500 ',    family: '"DM Sans", sans-serif' },
];

function getCustomFontSpec(px) {
  const f = TITLE_FONT_OPTIONS.find(x => x.id === customFont) || TITLE_FONT_OPTIONS[0];
  return f.weight + px + 'px ' + f.family;
}
// Per-photo crop offsets keyed by shot index. ox/oy in [-1, 1] where 0 is
// centered. Negative values shift the visible window towards the top/left
// (so the bottom/right of the photo shows more), positive does the inverse.
let photoOffsets = [];
// Multiplier applied to canvas dimensions. Drops to 0.5 during interactive
// adjustments so weak phones can keep up; restored to 1 when interaction
// ends so downloads stay full quality.
let renderScale = 1;
// Footer visibility toggles (Text tab → Footer section)
const showWordmark = true; // always-on now
let showDate     = true;

// Draggable text overlays — like stickers but with text. Each item:
//   { id, text, x, y, size, font, color, weight }
// where x/y/size are fractions of canvas width.
let textItems     = [];
let selectedTextId = null;
let textIdCounter  = 1;

const FONT_OPTIONS = [
  { id: 'serif',         label: 'Serif',          stack: '"DM Serif Display", serif',  weight: '400', italic: false },
  { id: 'serif-italic',  label: 'Serif Italic',   stack: '"DM Serif Display", serif',  weight: '400', italic: true  },
  { id: 'sans',          label: 'Sans',           stack: '"DM Sans", sans-serif',      weight: '500', italic: false },
  { id: 'sans-bold',     label: 'Sans Bold',      stack: '"DM Sans", sans-serif',      weight: '700', italic: false },
  { id: 'sans-light',    label: 'Sans Light',     stack: '"DM Sans", sans-serif',      weight: '300', italic: false },
];
function getFont(id) { return FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0]; }

const stripCanvas = document.getElementById('strip-canvas');
const sctx        = stripCanvas.getContext('2d');

const MODE_SHOTS = {
  '4cut': 4, '3cut': 3, '2cut': 2, '6cut': 6, '3horiz': 3,
  'squaregrid': 4, '1large3small': 4, 'grid4': 4, 'single': 1, 'polaroid': 1,
  'double-polaroid': 2, 'photocard': 1, 'gif': 1, 'tilt3': 3, '4plus1': 5,
  '9cut': 9, 'vertical4': 4, 'diptych': 2,
};
function maxShots() { return MODE_SHOTS[currentMode] || 1; }

// ── Load shots ──
async function loadShots() {
  // Fresh-start link from landing page: wipe any leftover photos.
  if (new URLSearchParams(location.search).get('fresh') === '1') {
    await clearShotsData();
    history.replaceState({}, '', 'customize.html');
  }
  const urls = await loadShotsData();
  if (urls && Array.isArray(urls)) {
    const sliced = urls.slice(0, maxShots());
    shots = await Promise.all(sliced.map(u => new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = u;
    })));
  }
  buildStrip();
  updateUploadCounter();
}

// Fill the slot completely (cover) — image is center-cropped to the slot's
// aspect ratio so there are no empty margins. ox/oy in [-1, 1] shift the
// visible crop window: -1 shows top/left edge, +1 shows bottom/right edge.
// Draw a single photo slot. If bg-removal is enabled and a cutout exists for
// this shot, fills the slot with the chosen color and paints the transparent
// cutout on top so the person appears against the new background.
function drawShotInto(ctx, shotImg, x, y, w, h, ox, oy) {
  const cutout = bgRemoveOn ? cutouts.get(shotImg) : null;
  if (cutout) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = bgRemoveColor;
    ctx.fillRect(x, y, w, h);
    drawCoverImage(ctx, cutout, x, y, w, h, ox, oy);
    ctx.restore();
  } else {
    drawCoverImage(ctx, shotImg, x, y, w, h, ox, oy);
  }
}

function drawCoverImage(ctx, img, x, y, w, h, ox = 0, oy = 0) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const boxAspect = w / h;
  let sx, sy, sw, sh;
  if (imgAspect > boxAspect) {
    sh = img.naturalHeight;
    sw = sh * boxAspect;
    const slack = img.naturalWidth - sw;
    sx = slack * (0.5 + ox * 0.5);
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / boxAspect;
    const slack = img.naturalHeight - sh;
    sx = 0;
    sy = slack * (0.5 + oy * 0.5);
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function showEmptyState() { /* no-op empty slots are drawn by buildStrip */ }
function clearEmptyState() { /* no-op */ }

// ── Unified brand footer ─────────────────────────────────────────
// One shared "BopBooth" wordmark + date placement used by every
// layout (except tilt3, which has its own designed footer). This
// keeps brand presentation visually consistent across all formats.
function footerReserveFor(mode) {
  switch (mode) {
    case '4cut':
    case '3cut':
    case '2cut':
    case 'vertical4':       return 220;
    case 'photocard':       return 100;
    case 'polaroid':
    case 'double-polaroid': return 90;
    case '4plus1':
    case 'diptych':         return 100;
    case '1large3small':    return 60;
    case '9cut':            return 60;
    case '6cut':
    case '3horiz':          return 52;
    case 'squaregrid':      return 48;
    case 'grid4':           return 40;
    default:                return 60;
  }
}

// Returns true if the strip's background is dark enough that we should
// flip the wordmark to white. Patterns are treated as light by default.
function isDarkStripBg() {
  if (bgOverride && bgOverride.type === 'solid') return isDarkHex(bgOverride.color);
  if (bgOverride && bgOverride.type === 'pattern') return false;
  // Photocard always has a forced white background regardless of frame.
  if (currentMode === 'photocard') return false;
  return isDarkHex(getFrameBg(currentFrame));
}

function isDarkHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance (Rec. 709)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5;
}

function drawBrandFooter(sctx, sw, sh, reserveH) {
  if (!showWordmark && !showDate) return;
  const wmSize   = Math.max(20, Math.min(reserveH * 0.42, sw * 0.045));
  const dateSize = Math.max(12, wmSize * 0.5);
  const cx       = sw / 2;
  const footerTop = sh - reserveH;
  const wmY   = footerTop + reserveH * (showDate ? 0.55 : 0.7);
  const dateY = footerTop + reserveH * 0.82;
  const dark = isDarkStripBg();
  const wmColor   = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';
  const dateColor = dark ? 'rgba(255,255,255,0.6)'  : 'rgba(0,0,0,0.35)';

  sctx.save();
  sctx.textAlign = 'center';
  sctx.textBaseline = 'alphabetic';
  if (showWordmark) {
    sctx.fillStyle = wmColor;
    sctx.font = `italic ${Math.round(wmSize)}px "DM Serif Display", serif`;
    sctx.fillText('BopBooth', cx, wmY);
  }
  if (showDate) {
    sctx.fillStyle = dateColor;
    sctx.font = `400 ${Math.round(dateSize)}px "DM Sans", sans-serif`;
    sctx.fillText(
      new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      cx, dateY
    );
  }
  sctx.restore();
}

// Draw the draggable custom-text overlay. Renders on top of stickers/photos
// at customTextPos. Centered around (cx, cy), with a contrast outline so it
// stays legible over any photo or background. Called by every build*Strip().
function drawCustomTextOverlay() {
  const txt = customText.trim();
  if (!txt) return;
  const sw = stripCanvas.width, sh = stripCanvas.height;
  const fs = Math.max(18, customTextSize * sw);
  const cx = customTextPos.x * sw;
  const cy = customTextPos.y * sh;
  sctx.save();
  sctx.font = getCustomFontSpec(fs);
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  const dark = isDarkStripBg();
  let fillColor, strokeColor;
  if (customTextColor === 'auto' || !customTextColor) {
    strokeColor = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
    fillColor   = dark ? 'rgba(255,255,255,0.98)' : 'rgba(0,0,0,0.92)';
  } else {
    fillColor = customTextColor;
    strokeColor = isDarkHex(customTextColor) ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)';
  }
  sctx.strokeStyle = strokeColor;
  sctx.lineWidth = Math.max(2, fs * 0.06);
  sctx.lineJoin = 'round';
  sctx.strokeText(txt, cx, cy);
  sctx.fillStyle = fillColor;
  sctx.fillText(txt, cx, cy);
  sctx.restore();
}

// Measured bounding box of the overlay text in canvas pixels (or null when
// empty). Used for pointer hit-testing.
function getCustomTextBBox() {
  const txt = customText.trim();
  if (!txt) return null;
  const sw = stripCanvas.width, sh = stripCanvas.height;
  const fs = Math.max(18, customTextSize * sw);
  sctx.save();
  sctx.font = getCustomFontSpec(fs);
  const w = sctx.measureText(txt).width;
  sctx.restore();
  const cx = customTextPos.x * sw;
  const cy = customTextPos.y * sh;
  // Generous padding so the stroke + descenders + previous-frame ghost from
  // a shrinking resize gesture all fall inside the dirty-rect clear region.
  const h = fs * 1.5;
  const pad = Math.max(20, fs * 0.45);
  return { x: cx - w / 2 - pad, y: cy - h / 2 - pad, w: w + pad * 2, h: h + pad * 2 };
}

// ── Layout selector ──
const LAYOUTS = [
  { id: '4cut',       name: '4-Cut Strip',       count: 4, shape: { cols: 1, rows: 4 } },
  { id: '3cut',       name: '3-Cut Strip',       count: 3, shape: { cols: 1, rows: 3 } },
  { id: '2cut',       name: '2-Cut Strip',       count: 2, shape: { cols: 1, rows: 2 } },
  { id: '6cut',       name: '6-Cut Grid',        count: 6, shape: { cols: 2, rows: 3 } },
  { id: '3horiz',     name: '3-Cut Horizontal',  count: 3, shape: { cols: 3, rows: 1 } },
  { id: 'squaregrid', name: 'Square Collage',    count: 4, shape: { cols: 2, rows: 2 } },
  { id: '1large3small', name: '1 Large + 3 Small', count: 4, shape: { cols: 3, rows: 2 },
    customCells: '<span style="grid-column:1/-1"></span><span></span><span></span><span></span>' },
  { id: 'grid4',      name: '2x2 Grid',          count: 4, shape: { cols: 2, rows: 2 } },
  { id: '4plus1',     name: '4 + 1 Group',       count: 5, shape: { cols: 2, rows: 3 },
    customCells: '<span></span><span></span><span></span><span></span><span style="grid-column:1/-1"></span>' },
  { id: '9cut',       name: '9-Cut Grid',        count: 9, shape: { cols: 3, rows: 3 } },
  { id: 'vertical4',  name: 'Puri 4-Cut',        count: 4, shape: { cols: 1, rows: 4 } },
  { id: 'diptych',    name: 'Diptych',           count: 2, shape: { cols: 2, rows: 1 } },
  { id: 'double-polaroid', name: 'Double Polaroid', count: 2, shape: { cols: 1, rows: 2 } },
  { id: 'tilt3',      name: 'Tilted 3-Cut',      count: 3, shape: { cols: 1, rows: 3 } },
  { id: 'polaroid',   name: 'Polaroid',          count: 1, shape: { cols: 1, rows: 1 } },
  { id: 'photocard',  name: 'Photo Card',        count: 1, shape: { cols: 1, rows: 1 } },
  { id: 'single',     name: 'Single Shot',       count: 1, shape: { cols: 1, rows: 1 } },
];

function initLayoutGrid() {
  const grid = document.getElementById('layout-grid');
  if (!grid) return;
  LAYOUTS.forEach(L => {
    const btn = document.createElement('button');
    btn.className = 'layout-mini' + (L.id === currentMode ? ' active' : '');
    btn.dataset.id = L.id;
    btn.title = L.name;
    const cells = L.customCells
      ? L.customCells
      : Array.from({length: L.shape.cols * L.shape.rows}, () => '<span></span>').join('');
    btn.innerHTML = `
      <div class="lm-shape">
        <div class="lm-strip lm-${L.id}">
          <div class="lm-header"></div>
          <div class="lm-cells">${cells}</div>
          <div class="lm-footer"></div>
        </div>
      </div>
      <div class="lm-name">${L.name}</div>
      <div class="lm-count">${L.count} ${L.count === 1 ? 'shot' : 'shots'}</div>`;
    btn.addEventListener('click', () => setMode(L.id));
    grid.appendChild(btn);
  });
}

function setMode(m) {
  if (m === currentMode && !currentTemplate) return;
  // Picking a layout clears the active template (template forces its own mode).
  if (currentTemplate) {
    currentTemplate = null;
    document.querySelectorAll('.template-card').forEach(el => el.classList.remove('active'));
  }
  currentMode = m;
  sessionStorage.setItem('sb_mode', m);
  if (typeof refreshTemplateAvailability === 'function') refreshTemplateAvailability();
  // Don't trim shots keep all uploaded photos so switching back to a
  // larger layout restores them. buildStrip only renders the first N.
  document.querySelectorAll('.layout-mini').forEach(el => {
    el.classList.toggle('active', el.dataset.id === m);
  });
  buildStrip();
  updateUploadCounter();
}

function updateUploadCounter() {
  const max = maxShots();
  const cur = Math.min(shots.length, max);
  const counter = document.getElementById('upload-counter');
  const label   = document.getElementById('upload-label');
  if (counter) counter.textContent = `${cur} / ${max} ${max === 1 ? 'photo' : 'photos'}`;
  if (label) {
    if (cur >= max)      label.textContent = 'Replace Photos';
    else if (cur === 0)  label.textContent = `Upload ${max} ${max === 1 ? 'Photo' : 'Photos'}`;
    else                 label.textContent = `Add ${max - cur} more`;
  }
}

function clearAllPhotos() {
  shots = [];
  photoOffsets = [];
  buildStrip();
  updateUploadCounter();
  if (typeof renderAdjustPanel === 'function') renderAdjustPanel();
  showToast('Photos cleared');
}

// Update the back link to preserve the selected mode
document.addEventListener('DOMContentLoaded', () => {
  const backLink = document.querySelector('a[href="app.html"]');
  if (backLink) {
    backLink.href = 'app.html?mode=' + currentMode;
  }
});

// Reveal the canvas + hide the loading skeleton once the first buildStrip
// finishes painting. Safe to call multiple times — only fires once.
let _skeletonHidden = false;
function hideStripSkeleton() {
  if (_skeletonHidden) return;
  _skeletonHidden = true;
  const sk = document.getElementById('strip-skeleton');
  if (sk) sk.classList.add('hidden-skeleton');
  if (stripCanvas) stripCanvas.style.display = '';
}

// ── Build strip (cloned from app.js) ──
function buildStrip() {
  _prevDirty = null;
  _prevTextBox = null;
  if (currentTemplate) { return buildTemplateStrip(); }
  if (currentMode === 'tilt3') { buildTilt3Strip(); return; }
  // Use fixed slot dimensions so layouts stay consistent no matter what
  // aspect ratios the user uploads. Each photo gets cover-fit into the
  // same standard slot, so mixed-aspect uploads still line up. renderScale
  // drops to 0.5 during interactive drags so the canvas redraws ~4× faster.
  const W = Math.round(1280 * renderScale);
  const H = Math.round(960 * renderScale);
  let sw, sh, positions;

  if (currentMode === '4cut') {
    const PAD=28, GAP=14, TOP=180, BOT=220;
    sw = W + PAD*2; sh = H*4 + GAP*3 + TOP + BOT;
    positions = Array.from({length:4}, (_,i) => ({x:PAD, y:TOP+i*(H+GAP), w:W, h:H}));
  } else if (currentMode === '3cut') {
    const PAD=28, GAP=14, TOP=180, BOT=220;
    sw = W + PAD*2; sh = H*3 + GAP*2 + TOP + BOT;
    positions = Array.from({length:3}, (_,i) => ({x:PAD, y:TOP+i*(H+GAP), w:W, h:H}));
  } else if (currentMode === '2cut') {
    const PAD=28, GAP=14, TOP=160, BOT=220;
    sw = W + PAD*2; sh = H*2 + GAP + TOP + BOT;
    positions = Array.from({length:2}, (_,i) => ({x:PAD, y:TOP+i*(H+GAP), w:W, h:H}));
  } else if (currentMode === '6cut') {
    const PAD=26, GAP=12, TOP=80, BOT=52;
    sw = W*2 + GAP + PAD*2; sh = H*3 + GAP*2 + TOP + BOT;
    positions = [];
    for (let r=0;r<3;r++) for (let c=0;c<2;c++)
      positions.push({x:PAD+c*(W+GAP), y:TOP+r*(H+GAP), w:W, h:H});
  } else if (currentMode === '3horiz') {
    const PAD=28, GAP=14, TOP=80, BOT=52;
    const sW = H;
    const sH = W;
    sw = sW * 3 + GAP * 2 + PAD * 2; sh = sH + TOP + BOT;
    positions = Array.from({length:3}, (_,i) => ({x:PAD+i*(sW+GAP), y:TOP, w:sW, h:sH}));
  } else if (currentMode === 'squaregrid') {
    const PAD=48, GAP=12;
    sw = W*2 + GAP + PAD*2; sh = H*2 + GAP + PAD*2;
    positions = [
      {x:PAD,y:PAD,w:W,h:H},{x:PAD+W+GAP,y:PAD,w:W,h:H},
      {x:PAD,y:PAD+H+GAP,w:W,h:H},{x:PAD+W+GAP,y:PAD+H+GAP,w:W,h:H},
    ];
  } else if (currentMode === '1large3small') {
    const PAD = 30, GAP = 12, TOP = 30, BOT = 60;
    const sW = (W - GAP * 2) / 3;
    const sH = sW * (H / W);
    sw = W + PAD * 2; sh = H + GAP + sH + TOP + BOT;
    positions = [
      { x: PAD, y: TOP, w: W, h: H },
      { x: PAD, y: TOP + H + GAP, w: sW, h: sH },
      { x: PAD + sW + GAP, y: TOP + H + GAP, w: sW, h: sH },
      { x: PAD + sW * 2 + GAP * 2, y: TOP + H + GAP, w: sW, h: sH },
    ];
  } else if (currentMode === 'grid4') {
    const PAD = 40, GAP = 20, TOP = 40, BOT = 40;
    sw = W * 2 + GAP + PAD * 2; sh = H * 2 + GAP + TOP + BOT;
    positions = [
      { x: PAD, y: TOP, w: W, h: H },
      { x: PAD + W + GAP, y: TOP, w: W, h: H },
      { x: PAD, y: TOP + H + GAP, w: W, h: H },
      { x: PAD + W + GAP, y: TOP + H + GAP, w: W, h: H },
    ];
  } else if (currentMode === '9cut') {
    const PAD = 24, GAP = 10, TOP = 80, BOT = 60;
    sw = W * 3 + GAP * 2 + PAD * 2;
    sh = H * 3 + GAP * 2 + TOP + BOT;
    positions = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        positions.push({ x: PAD + c * (W + GAP), y: TOP + r * (H + GAP), w: W, h: H });
  } else if (currentMode === 'vertical4') {
    const PAD = 28, GAP = 16, TOP = 100, BOT = 220;
    const pW = Math.round(W * 0.55);
    const pH = H;
    sw = pW + PAD * 2;
    sh = pH * 4 + GAP * 3 + TOP + BOT;
    positions = Array.from({ length: 4 }, (_, i) => ({ x: PAD, y: TOP + i * (pH + GAP), w: pW, h: pH }));
  } else if (currentMode === 'diptych') {
    const PAD = 28, GAP = 14, TOP = 80, BOT = 100;
    sw = W * 2 + GAP + PAD * 2;
    sh = H + TOP + BOT;
    positions = [
      { x: PAD,           y: TOP, w: W, h: H },
      { x: PAD + W + GAP, y: TOP, w: W, h: H },
    ];
  } else if (currentMode === '4plus1') {
    // 4 small photos in a 2×2 grid on top, 1 wide group photo below.
    const PAD = 40, GAP = 16, TOP = 80, BOT = 100;
    const smallW = W;
    const smallH = Math.round(H * 0.7);
    const wideW = smallW * 2 + GAP;
    const wideH = Math.round(H * 0.95);
    sw = wideW + PAD * 2;
    sh = smallH * 2 + GAP + wideH + GAP + TOP + BOT;
    positions = [
      { x: PAD,                   y: TOP,                          w: smallW, h: smallH },
      { x: PAD + smallW + GAP,    y: TOP,                          w: smallW, h: smallH },
      { x: PAD,                   y: TOP + smallH + GAP,           w: smallW, h: smallH },
      { x: PAD + smallW + GAP,    y: TOP + smallH + GAP,           w: smallW, h: smallH },
      { x: PAD,                   y: TOP + smallH * 2 + GAP * 2,   w: wideW,  h: wideH  },
    ];
  } else if (currentMode === 'photocard') {
    const BX=40, BT=30, BB=100;
    sw = W + BX*2; sh = H + BT + BB;
    positions = [{x:BX, y:BT, w:W, h:H}];
  } else if (currentMode === 'polaroid') {
    const BP=30, BT=20, BB=90;
    sw = W + BP*2; sh = H + BT + BB;
    positions = [{x:BP, y:BT, w:W, h:H}];
  } else if (currentMode === 'double-polaroid') {
    const BP = 30, BT = 20, GAP = 50, BB = 90;
    sw = W + BP * 2; sh = H * 2 + GAP + BT + BB;
    positions = [
      { x: BP, y: BT, w: W, h: H },
      { x: BP, y: BT + H + GAP, w: W, h: H },
    ];
  } else {
    const BP=16;
    sw = W + BP*2; sh = H + BP*2;
    positions = [{x:BP, y:BP, w:W, h:H}];
  }

  stripCanvas.width = sw; stripCanvas.height = sh;

  if (bgOverride && bgOverride.type === 'pattern' && bgOverride.img && bgOverride.img.complete) {
    sctx.fillStyle = sctx.createPattern(bgOverride.img, 'repeat');
  } else if (bgOverride && bgOverride.type === 'solid') {
    sctx.fillStyle = bgOverride.color;
  } else if (currentMode === 'photocard') {
    sctx.fillStyle = '#ffffff';
  } else {
    sctx.fillStyle = getFrameBg(currentFrame);
  }
  sctx.fillRect(0, 0, sw, sh);

  // Themed frame title in the top reserved zone replaced by user's
  // custom text when provided. Falls back to bottom space (e.g. polaroid,
  // photocard) when there's no usable top area.
  const topReserve = positions[0] ? positions[0].y : 0;
  if (topReserve > 30) {
    drawFrameTitle(sctx, currentFrame, sw, sh, topReserve);
  }

  const mirror = typeof frameMirrorsPhotos === 'function' && frameMirrorsPhotos(currentFrame);
  positions.forEach((pos, i) => {
    const {x,y,w,h} = pos;
    const img = shots[i];
    if (img) {
      const off = photoOffsets[i] || { ox: 0, oy: 0 };
      if (mirror) {
        sctx.save();
        sctx.translate(x + w, y);
        sctx.scale(-1, 1);
        drawShotInto(sctx, img, 0, 0, w, h, off.ox, off.oy);
        sctx.restore();
      } else {
        drawShotInto(sctx, img, x, y, w, h, off.ox, off.oy);
      }
      sctx.strokeStyle = 'rgba(0,0,0,0.32)';
      sctx.lineWidth = 2;
      sctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    } else {
      // Empty placeholder slot
      sctx.fillStyle = 'rgba(0,0,0,0.06)';
      sctx.fillRect(x, y, w, h);
      sctx.strokeStyle = 'rgba(0,0,0,0.18)';
      sctx.setLineDash([8, 6]);
      sctx.lineWidth = 2;
      sctx.strokeRect(x+1, y+1, w-2, h-2);
      sctx.setLineDash([]);
      sctx.fillStyle = 'rgba(0,0,0,0.35)';
      sctx.font = '500 ' + Math.max(28, Math.floor(h*0.12)) + 'px DM Sans, sans-serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText('Slot ' + (i+1), x + w/2, y + h/2);
      sctx.textAlign = 'start';
      sctx.textBaseline = 'alphabetic';
    }
  });

  // Frame decorations render ABOVE photos so themed text (REC, date stamp,
  // wordmarks, borders, sparkles) is never hidden by photo content. Clip to
  // the area above the brand-footer band so heavy frames (Y2K Chrome,
  // Coquette, Holiday, etc.) can't bleed art over BopBooth + date.
  const footerReserve = footerReserveFor(currentMode);
  const ownFooter = typeof frameHasOwnFooter === 'function' && frameHasOwnFooter(currentFrame);
  if (currentMode !== 'photocard' && !bgOverride) {
    if (ownFooter) {
      // Frame has its own designed bottom wordmark/date — draw unclipped.
      drawFrameDecorations(sctx, currentFrame, sw, sh);
    } else {
      window.__frameBottomY = sh - footerReserve;
      sctx.save();
      sctx.beginPath();
      sctx.rect(0, 0, sw, sh - footerReserve);
      sctx.clip();
      drawFrameDecorations(sctx, currentFrame, sw, sh);
      sctx.restore();
      window.__frameBottomY = null;
    }
  }

  // Unified brand footer — one consistent placement across every layout.
  // Skipped when the frame already paints its own designed footer.
  if (currentMode !== 'tilt3' && !ownFooter) drawBrandFooter(sctx, sw, sh, footerReserve);

  // Snapshot the base (everything except stickers) so sticker drags can
  // skip re-rasterizing photos & frame on every pointer event.
  if (!_baseCanvas) _baseCanvas = document.createElement('canvas');
  if (_baseCanvas.width !== sw || _baseCanvas.height !== sh) {
    _baseCanvas.width = sw; _baseCanvas.height = sh;
  }
  const bctx = _baseCanvas.getContext('2d');
  bctx.clearRect(0, 0, sw, sh);
  bctx.drawImage(stripCanvas, 0, 0);

  // Draw stickers
  drawAllStickers();
  drawCustomTextOverlay();
}

// ── Tilt3 layout: dark red strip with 3 slightly-tilted black-bordered
// photo slots and a "BopBooth / your text" footer (matches the Canva
// design from the user). Drawn programmatically so it stays crisp at
// any scale and respects bgOverride / customText.
function buildTilt3Strip() {
  const W = (shots[0] && shots[0].naturalWidth)  || 1280;
  const H = (shots[0] && shots[0].naturalHeight) || 960;
  const PAD    = 70;
  const GAP    = 40;
  const TOP    = 70;
  const BOT    = 240;
  const BORDER = 18;
  const TILTS  = [-1.5, 2, -2];

  const sw = W + PAD * 2;
  const sh = H * 3 + GAP * 2 + TOP + BOT;
  stripCanvas.width = sw; stripCanvas.height = sh;

  // Background — dark red unless overridden via Color tab
  if (bgOverride && bgOverride.type === 'pattern' && bgOverride.img && bgOverride.img.complete) {
    sctx.fillStyle = sctx.createPattern(bgOverride.img, 'repeat');
  } else if (bgOverride && bgOverride.type === 'solid') {
    sctx.fillStyle = bgOverride.color;
  } else {
    sctx.fillStyle = '#5C0000';
  }
  sctx.fillRect(0, 0, sw, sh);

  // Three tilted photo slots
  for (let i = 0; i < 3; i++) {
    const cx = sw / 2;
    const cy = TOP + H / 2 + i * (H + GAP);
    sctx.save();
    sctx.translate(cx, cy);
    sctx.rotate(TILTS[i] * Math.PI / 180);

    // Black border behind photo
    sctx.fillStyle = '#0a0a0a';
    sctx.fillRect(-W / 2 - BORDER, -H / 2 - BORDER, W + BORDER * 2, H + BORDER * 2);

    const img = shots[i];
    if (img) {
      // White backing so the contain-fit margins match the rest of the strip
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(-W / 2, -H / 2, W, H);
      const off = photoOffsets[i] || { ox: 0, oy: 0 };
      drawShotInto(sctx, img, -W / 2, -H / 2, W, H, off.ox, off.oy);
    } else {
      sctx.fillStyle = 'rgba(255,255,255,0.06)';
      sctx.fillRect(-W / 2, -H / 2, W, H);
      sctx.strokeStyle = 'rgba(255,255,255,0.4)';
      sctx.setLineDash([10, 8]);
      sctx.lineWidth = 3;
      sctx.strokeRect(-W / 2 + 2, -H / 2 + 2, W - 4, H - 4);
      sctx.setLineDash([]);
      sctx.fillStyle = 'rgba(255,255,255,0.75)';
      sctx.font = '500 ' + Math.max(28, Math.floor(H * 0.12)) + 'px DM Sans, sans-serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText('Slot ' + (i + 1), 0, 0);
      sctx.textAlign = 'start';
      sctx.textBaseline = 'alphabetic';
    }
    sctx.restore();
  }

  // Footer text: BopBooth + custom subline
  sctx.fillStyle = '#FAF6EE';
  sctx.textAlign = 'center';
  sctx.font = Math.floor(BOT * 0.34) + 'px "DM Serif Display", serif';
  sctx.fillText('BopBooth', sw / 2, sh - BOT * 0.55);

  sctx.font = getCustomFontSpec(Math.floor(BOT * 0.22));
  sctx.fillStyle = 'rgba(250,246,238,0.92)';
  sctx.fillText(
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    sw / 2, sh - BOT * 0.22
  );
  sctx.textAlign = 'start';

  // Snapshot for sticker drag fast-path
  if (!_baseCanvas) _baseCanvas = document.createElement('canvas');
  if (_baseCanvas.width !== sw || _baseCanvas.height !== sh) {
    _baseCanvas.width = sw; _baseCanvas.height = sh;
  }
  const bctx = _baseCanvas.getContext('2d');
  bctx.clearRect(0, 0, sw, sh);
  bctx.drawImage(stripCanvas, 0, 0);

  // Draw stickers
  drawAllStickers();
  drawCustomTextOverlay();
}

// ── Template strip: draw a template image as background and place photos
// into its predefined slot rectangles. ──
function buildTemplateStrip() {
  const tpl = getTemplate(currentTemplate);
  if (!tpl) { currentTemplate = null; buildStrip(); return; }
  // Templates are designed for a specific layout (e.g. 4-cut). If the
  // user is in a different layout, the template can't apply — fall back
  // to the regular layout renderer.
  if (tpl.mode !== currentMode) {
    currentTemplate = null;
    document.querySelectorAll('.template-card').forEach(el => el.classList.remove('active'));
    buildStrip();
    return;
  }

  // Pick a canvas size based on template aspect (w/h). Use a comfortable
  // 1200px wide baseline for vertical strips, 1400 for wider templates.
  const baseW = tpl.aspect < 0.7 ? 900 : 1400;
  const sw = baseW;
  const sh = Math.round(sw / tpl.aspect);
  stripCanvas.width = sw;
  stripCanvas.height = sh;

  // Background fill (so transparent template PNGs have something behind)
  if (bgOverride && bgOverride.type === 'pattern' && bgOverride.img && bgOverride.img.complete) {
    sctx.fillStyle = sctx.createPattern(bgOverride.img, 'repeat');
  } else if (bgOverride && bgOverride.type === 'solid') {
    sctx.fillStyle = bgOverride.color;
  } else {
    sctx.fillStyle = '#ffffff';
  }
  sctx.fillRect(0, 0, sw, sh);

  const drawPhotosAndOverlay = (tplImg) => {
    // Draw template image first as the underlay so photos paint on top.
    // For decorative patterns (whiteBox=true) we want the template UNDER
    // the photos so the boxes sit on top; for templates with built-in
    // photo cutouts we also draw under, then place photos in the slots.
    if (tplImg) sctx.drawImage(tplImg, 0, 0, sw, sh);

    tpl.slots.forEach((slot, i) => {
      const x = slot.x * sw, y = slot.y * sh;
      const w = slot.w * sw, h = slot.h * sh;

      if (tpl.whiteBox) {
        // White backing for patterns without built-in cutouts
        sctx.fillStyle = '#ffffff';
        sctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      }

      const img = shots[i];
      if (img) {
        const off = photoOffsets[i] || { ox: 0, oy: 0 };
        drawShotInto(sctx, img, x, y, w, h, off.ox, off.oy);
      } else {
        sctx.fillStyle = 'rgba(0,0,0,0.06)';
        sctx.fillRect(x, y, w, h);
        sctx.strokeStyle = 'rgba(0,0,0,0.25)';
        sctx.setLineDash([8, 6]);
        sctx.lineWidth = 2;
        sctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        sctx.setLineDash([]);
        sctx.fillStyle = 'rgba(0,0,0,0.45)';
        sctx.font = '500 ' + Math.max(20, Math.floor(h * 0.14)) + 'px DM Sans, sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText('Slot ' + (i + 1), x + w / 2, y + h / 2);
        sctx.textAlign = 'start';
        sctx.textBaseline = 'alphabetic';
      }
      sctx.strokeStyle = 'rgba(0,0,0,0.32)';
      sctx.lineWidth = 2;
      sctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    });

    // Snapshot for sticker drag fast-path
    if (!_baseCanvas) _baseCanvas = document.createElement('canvas');
    if (_baseCanvas.width !== sw || _baseCanvas.height !== sh) {
      _baseCanvas.width = sw; _baseCanvas.height = sh;
    }
    const bctx = _baseCanvas.getContext('2d');
    bctx.clearRect(0, 0, sw, sh);
    bctx.drawImage(stripCanvas, 0, 0);
    drawAllStickers();
    drawCustomTextOverlay();
  };

  return loadTemplateImage(tpl.file)
    .then(drawPhotosAndOverlay)
    .catch(() => drawPhotosAndOverlay(null));
}

function setTemplate(id) {
  const tpl = getTemplate(id);
  if (!tpl) return;
  // Templates only apply to their designated layout. If the user is in a
  // different layout, surface a toast and don't activate.
  if (tpl.mode !== currentMode) {
    showToast(`This template only works on ${tpl.mode === '4cut' ? '4-Cut Strip' : tpl.mode}. Switch layout first.`);
    return;
  }
  currentTemplate = id;
  document.querySelectorAll('.template-card').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  buildStrip();
  updateUploadCounter();
}

// Disable / enable template cards based on whether their mode matches the
// current layout. Disabled cards still render (so the user sees what's
// available) but are dimmed and show a tooltip.
function refreshTemplateAvailability() {
  document.querySelectorAll('.template-card').forEach(el => {
    const t = getTemplate(el.dataset.id);
    if (!t) return;
    const ok = t.mode === currentMode;
    el.classList.toggle('template-card--disabled', !ok);
    el.title = ok ? t.name : `${t.name} — only available on ${t.mode === '4cut' ? '4-Cut Strip' : t.mode}`;
  });
  // Banner inside the templates panel
  const banner = document.getElementById('template-banner');
  if (banner) {
    const has4cutMatch = TEMPLATES.some(t => t.mode === currentMode);
    banner.classList.toggle('hidden', has4cutMatch);
  }
}

function clearTemplate() {
  currentTemplate = null;
  document.querySelectorAll('.template-card').forEach(el => el.classList.remove('active'));
  buildStrip();
}

function initTemplateGrid() {
  const grid = document.getElementById('templates-grid');
  if (!grid) return;
  TEMPLATES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'template-card rounded-2xl border border-sand transition flex flex-col items-center gap-1 p-2 hover:bg-cream2';
    btn.dataset.id = t.id;
    const layoutLabel = t.mode === '4cut' ? '4-Cut' : t.mode;
    btn.innerHTML = `
      <img src="${t.file}" alt="${t.name}" style="width:100%;max-height:140px;object-fit:contain;border-radius:8px;background:#fff;">
      <div class="text-xs font-medium text-ink2 mt-1">${t.name}</div>
      <div class="text-[10px] text-muted">${layoutLabel} · ${t.slots.length} photos</div>`;
    btn.addEventListener('click', () => setTemplate(t.id));
    grid.appendChild(btn);
  });
  const clearBtn = document.getElementById('clear-template');
  if (clearBtn) clearBtn.addEventListener('click', clearTemplate);
  refreshTemplateAvailability();
}

// ── Frame grid ──
function initFrameGrid() {
  const grid = document.getElementById('frames-grid');
  FRAMES.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'frame-chip rounded-2xl border border-sand transition flex flex-col items-center justify-center gap-2 hover:bg-cream2';
    btn.style.background = f.bg;
    btn.dataset.id = f.id;
    if (f.id === currentFrame) btn.classList.add('active');

    let preview = '';
    if (f.preview === 'strip')        preview = `<div class="text-3xl leading-none">▤</div>`;
    else if (f.preview === 'border')  preview = `<div class="text-3xl leading-none">▢</div>`;
    else if (f.preview === 'minimal') preview = `<div class="text-3xl leading-none">▫</div>`;
    else                              preview = `<div class="text-4xl leading-none">${f.preview}</div>`;

    const dark = f.bg === '#0e0e22' ? 'text-white' : 'text-ink2';
    btn.innerHTML = `${preview}<div class="${dark} text-sm font-medium">${f.label}</div>`;

    btn.addEventListener('click', () => {
      currentFrame = f.id;
      bgOverride = null;
      currentTemplate = null;
      document.querySelectorAll('.template-card').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.frame-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      document.querySelector('.color-swatch[data-i="default"]')?.classList.add('active');
      applyFrameAutoStickers(f.id);
      buildStrip();
    });
    grid.appendChild(btn);
  });
}

// Replace any auto-stickers from a previous frame with this frame's defaults.
// Manually-added stickers (no `auto` flag) are preserved.
function applyFrameAutoStickers(frameId) {
  stickers = stickers.filter(s => !s.auto);
  const list = (typeof getFrameAutoStickers === 'function')
    ? getFrameAutoStickers(frameId) : [];
  list.forEach(spec => {
    // Make sure the SVG is in the cache before draw
    if (!stickerImgCache[spec.file]) {
      const im = new Image();
      im.src = spec.file;
      stickerImgCache[spec.file] = im;
    }
    stickers.push({ ...spec, auto: true });
  });
}

// ── Pattern generators (SVG → data URL) ──
function svgUrl(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function pGingham(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><rect width='28' height='28' fill='${c2}'/><rect x='0' y='0' width='14' height='28' fill='${c1}' opacity='.45'/><rect x='0' y='0' width='28' height='14' fill='${c1}' opacity='.45'/></svg>`;
}
function pPolka(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><rect width='22' height='22' fill='${c2}'/><circle cx='6' cy='6' r='2.6' fill='${c1}'/><circle cx='17' cy='17' r='2.6' fill='${c1}'/></svg>`;
}
function pCheck(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='20' height='20' fill='${c2}'/><rect width='10' height='10' fill='${c1}'/><rect x='10' y='10' width='10' height='10' fill='${c1}'/></svg>`;
}
function pStripe(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><rect width='14' height='14' fill='${c2}'/><rect width='14' height='7' fill='${c1}'/></svg>`;
}
function pDiamond(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='24' height='24' fill='${c2}'/><polygon points='12,2 22,12 12,22 2,12' fill='${c1}' opacity='.85'/></svg>`;
}
function pHearts(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><rect width='28' height='28' fill='${c2}'/><text x='14' y='20' font-size='16' text-anchor='middle' fill='${c1}'>♥</text></svg>`;
}
function pStars(c1, c2) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><rect width='28' height='28' fill='${c2}'/><text x='14' y='20' font-size='16' text-anchor='middle' fill='${c1}'>★</text></svg>`;
}
function pRainbow() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff8b94'/><stop offset='.25' stop-color='#ffd166'/><stop offset='.5' stop-color='#a8e6cf'/><stop offset='.75' stop-color='#81d4fa'/><stop offset='1' stop-color='#ce93d8'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/></svg>`;
}
function pLeopard() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><rect width='60' height='60' fill='#E8C497'/><g fill='#5B3A1F'><ellipse cx='12' cy='14' rx='4' ry='3'/><ellipse cx='38' cy='8' rx='3' ry='2.5'/><ellipse cx='48' cy='28' rx='3.5' ry='2.7'/><ellipse cx='20' cy='38' rx='3.2' ry='2.4'/><ellipse cx='32' cy='48' rx='3' ry='2.3'/><ellipse cx='8' cy='52' rx='3.3' ry='2.6'/></g></svg>`;
}
function pCow() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='white'/><g fill='#111'><path d='M5,10 Q15,5 25,15 Q20,30 8,25 Z'/><path d='M50,8 Q60,12 58,28 Q45,30 42,18 Z'/><path d='M30,40 Q42,38 48,52 Q35,60 25,52 Z'/><path d='M62,55 Q75,52 72,70 Q60,75 55,65 Z'/></g></svg>`;
}
function pCherry() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='#FCE4E8'/><text x='20' y='27' font-size='18' text-anchor='middle'>🌸</text></svg>`;
}
function pMarble() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><defs><filter id='t'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3' seed='3'/><feColorMatrix values='0 0 0 0 .9  0 0 0 0 .87  0 0 0 0 .82  0 0 0 1 0'/></filter></defs><rect width='160' height='160' fill='#F4EFE6'/><rect width='160' height='160' filter='url(#t)' opacity='.8'/></svg>`;
}

// Ordered groups: clear → neutrals → pinks → reds/wines → warms →
// yellows → greens → blues → purples → themed sets → patterns. Sorting
// by hue makes the swatch grid feel like a real color picker.
const PATTERNS = [
  // Clear / reset to frame default
  { id:'default', label:'No fill (use frame)', swatch:'#ffffff', clear:true },

  // Neutrals
  { id:'white',         label:'White',         type:'solid', color:'#FFFFFF' },
  { id:'smoke',         label:'Smoke',         type:'solid', color:'#FAF8F2' },
  { id:'aes-2',         label:'Beige',         type:'solid', color:'#E5D7C0' },
  { id:'aes-6',         label:'Cream',         type:'solid', color:'#F2EAD3' },
  { id:'kor-2',         label:'Korean Cream',  type:'solid', color:'#FDF1E0' },
  { id:'tan',           label:'Tan',           type:'solid', color:'#D4A574' },
  { id:'mocha-mousse',  label:'Mocha Mousse',  type:'solid', color:'#A47864' },
  { id:'aes-3',         label:'Mocha',         type:'solid', color:'#A98467' },
  { id:'tokyo-cool',    label:'Tokyo Cool',    type:'solid', color:'#1A1A1A' },
  { id:'black',         label:'Black',         type:'solid', color:'#0A0A0A' },

  // Pinks / blush
  { id:'kor-1',   label:'Korean Blush', type:'solid', color:'#FBD9DD' },
  { id:'pink',    label:'Pink',         type:'solid', color:'#F2C6CC' },
  { id:'bday-1',  label:'Birthday Pink',type:'solid', color:'#FFB7CE' },
  { id:'rose',    label:'Rose',         type:'solid', color:'#D89BA3' },
  { id:'kor-3',   label:'Korean Rose',  type:'solid', color:'#E8A6B0' },
  { id:'aes-5',   label:'Mauve',        type:'solid', color:'#B59B9C' },
  { id:'zenz-2',  label:'Magenta',      type:'solid', color:'#E0339B' },

  // Reds / wines
  { id:'cherry-red',  label:'Cherry Red', type:'solid', color:'#C8313A' },
  { id:'maroon',      label:'Maroon',     type:'solid', color:'#7A1F2E' },
  { id:'maroon-solid',label:'Wine',       type:'solid', color:'#5A1825' },
  { id:'grad-3',      label:'Burgundy',   type:'solid', color:'#5C1A2B' },

  // Warms (orange, gold)
  { id:'grad-2',        label:'Gold',          type:'solid', color:'#D4AF37' },
  { id:'butter-yellow', label:'Butter Yellow', type:'solid', color:'#F4E5B2' },
  { id:'butter',        label:'Soft Butter',   type:'solid', color:'#FFF3A0' },
  { id:'bday-3',        label:'Birthday Lemon',type:'solid', color:'#FFE680' },

  // Greens
  { id:'sage',    label:'Sage',         type:'solid', color:'#B5C994' },
  { id:'aes-1',   label:'Aesthetic Sage',type:'solid', color:'#A8B89A' },
  { id:'aes-4',   label:'Olive',        type:'solid', color:'#7A8450' },
  { id:'forest',  label:'Forest',       type:'solid', color:'#2F4F37' },
  { id:'bday-2',  label:'Birthday Mint',type:'solid', color:'#A8E6CF' },

  // Blues
  { id:'sky',       label:'Sky',         type:'solid', color:'#BEE3F0' },
  { id:'sky-solid', label:'Sky Solid',   type:'solid', color:'#A0C4FF' },
  { id:'navy',      label:'Navy',        type:'solid', color:'#1F2D4A' },
  { id:'grad-1',    label:'Grad Navy',   type:'solid', color:'#1A2E4A' },
  { id:'zenz-3',    label:'Zenz Cyber',  type:'solid', color:'#1B1A40' },

  // Purples / lilac
  { id:'lilac',   label:'Lilac',        type:'solid', color:'#C9B6E4' },
  { id:'zenz-1',  label:'Zenz Violet',  type:'solid', color:'#7B5BC5' },

  // Patterns & decorative
  { id:'rainbow',      label:'Rainbow',       svg: pRainbow() },
  { id:'marble',       label:'Marble',        svg: pMarble() },
  { id:'cream-stripe', label:'Cream Stripe',  svg: pStripe('#E8DCC4','#FFFFFF') },
  { id:'pink-stripe',  label:'Pink Stripe',   svg: pStripe('#F2B8C6','#FFFFFF') },
  { id:'pink-polka',   label:'Pink Polka',    svg: pPolka('#E89BA8','#FCE4E8') },
  { id:'cream-bw',     label:'Cream Polka',   svg: pPolka('#1A1A1A','#F4EFE6') },
  { id:'pink-check',   label:'Pink Check',    svg: pCheck('#F2B8C6','#FFFFFF') },
  { id:'red-check',    label:'Red Check',     svg: pCheck('#C9302C','#FFFFFF') },
  { id:'maroon-check', label:'Maroon Check',  svg: pCheck('#7A1F2E','#E8C5BD') },
  { id:'bw-check',     label:'B&W Check',     svg: pCheck('#1A1A1A','#FFFFFF') },
  { id:'yel-blue',     label:'Sun & Sea',     svg: pCheck('#F4D35E','#5A8FB8') },
  { id:'red-gingham',  label:'Red Gingham',   svg: pGingham('#C9302C','#FCD9D9') },
  { id:'blue-gingham', label:'Blue Gingham',  svg: pGingham('#5A8FB8','#E0EAF4') },
  { id:'green-gingham',label:'Green Gingham', svg: pGingham('#7BA968','#E0EFD8') },
  { id:'diamond',      label:'Diamond',       svg: pDiamond('#1A1A1A','#FFFFFF') },
  { id:'hearts',       label:'Hearts',        svg: pHearts('#E85A6E','#FCE4E8') },
  { id:'stars',        label:'Stars',         svg: pStars('#3D5A80','#E8EEF7') },
  { id:'cherry',       label:'Cherry',        svg: pCherry() },
  { id:'leopard',      label:'Leopard',       svg: pLeopard() },
  { id:'cow',          label:'Cow Print',     svg: pCow() },
];

// ── Color swatches ──
function initColorSwatches() {
  const grid = document.getElementById('color-swatches');
  PATTERNS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'color-swatch';
    btn.dataset.i = p.id;
    btn.title = p.label || p.id;

    if (p.clear) {
      btn.classList.add('active');
      btn.style.background = 'conic-gradient(from 0deg, #ff6b6b, #ffd166, #06d6a0, #118ab2, #ef476f, #ff6b6b)';
      btn.style.opacity = '.85';
    } else if (p.type === 'solid') {
      btn.style.background = p.color;
    } else if (p.svg) {
      btn.style.backgroundImage = `url("${svgUrl(p.svg)}")`;
      // preload pattern image
      const im = new Image();
      im.src = svgUrl(p.svg);
      p.img = im;
    }

    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      if (p.clear) bgOverride = null;
      else if (p.type === 'solid') bgOverride = { type:'solid', color: p.color };
      else if (p.img) {
        if (p.img.complete) {
          bgOverride = { type:'pattern', img: p.img };
          buildStrip();
        } else {
          p.img.onload = () => { bgOverride = { type:'pattern', img: p.img }; buildStrip(); };
        }
        return;
      }
      buildStrip();
    });
    grid.appendChild(btn);
  });

  // Live-update the preview swatch overlay as the user picks a color
  const customColorInput = document.getElementById('custom-color');
  const customColorWrap = document.querySelector('.custom-color-wrap');
  const customColorPreview = document.getElementById('custom-color-preview');
  if (customColorInput) {
    customColorInput.addEventListener('input', e => {
      if (customColorPreview) customColorPreview.style.background = e.target.value;
      if (customColorWrap) customColorWrap.classList.add('custom-active');
    });
  }

  document.getElementById('apply-custom').addEventListener('click', () => {
    bgOverride = { type:'solid', color: document.getElementById('custom-color').value };
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    buildStrip();
  });
  document.getElementById('reset-color').addEventListener('click', () => {
    bgOverride = null;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    document.querySelector('.color-swatch[data-i="default"]')?.classList.add('active');
    if (customColorWrap) customColorWrap.classList.remove('custom-active');
    buildStrip();
  });
}

// ── Sticker grid ──
async function fetchSharpSVG(url) {
  if (!url.endsWith('.svg')) return url;
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    // Set a large intrinsic size so the browser rasterizes it crisply before scaling
    svg.setAttribute('width', '1024');
    svg.setAttribute('height', '1024');
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'});
    return URL.createObjectURL(blob);
  } catch (e) {
    return url;
  }
}

function initStickerGrid() {
  // Pre-fetching + rewrapping every SVG on init was thrashing low-end phones.
  // Defer that work until a sticker is actually used.

  const grid = document.getElementById('stickers-grid');
  if (grid) {
    STICKERS.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'sticker-card';
      btn.title = s.name;
      const img = document.createElement('img');
      img.src = s.file; img.alt = s.name; img.draggable = false;
      img.loading = 'lazy';
      img.decoding = 'async';
      btn.appendChild(img);
      btn.addEventListener('click', () => {
        // Center the sticker and place it slightly lower to avoid overlapping Slot 1 immediately
        stickers.push({ file: s.file, x: 0.5, y: 0.6, size: 0.16, rot: 0 });
        let cached = stickerImgCache[s.file];
        if (!cached) {
          cached = new Image();
          cached.src = s.file;
          stickerImgCache[s.file] = cached;
        }
        selectedStickerIdx = stickers.length - 1;
        updateStickerSelectionUI();
        if (cached.complete) buildStrip();
        else cached.onload = () => buildStrip();
        showToast(s.name + ' drag to move, scroll/pinch to resize');
      });
      grid.appendChild(btn);
    });
  }

  const deleteBtn = document.getElementById('delete-selected-sticker');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (selectedStickerIdx !== null && selectedStickerIdx >= 0 && selectedStickerIdx < stickers.length) {
        stickers.splice(selectedStickerIdx, 1);
        selectedStickerIdx = null;
        updateStickerSelectionUI();
        buildStrip();
      }
    });
  }

  const clearBtn = document.getElementById('clear-stickers');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      stickers = [];
      selectedStickerIdx = null;
      updateStickerSelectionUI();
      buildStrip();
    });
  }
}

// Unified sticker-add. Overrides the legacy stickers.js global which used
// pixel sizing (`size: 70`) — that broke the customize.js renderer (which
// treats `size` as a fraction of canvas width) and made stickers either
// invisible or laggy. Wider stickers (text banners) get a bigger default
// fraction; square stickers stay compact.
function addSticker(spec) {
  if (!spec || !spec.file) return;
  // Default size is 0.16 (matches the image-sticker click handler). Text-
  // banner SVGs are wider than tall, so give them more room so they read.
  const isTextBanner = /text-stickers\//.test(spec.file) || /\.text\b/.test(spec.name || '');
  const size = spec.size || (isTextBanner ? 0.36 : 0.16);
  stickers.push({
    file: spec.file,
    x:    typeof spec.x === 'number' ? spec.x : 0.5,
    y:    typeof spec.y === 'number' ? spec.y : 0.6,
    size,
    rot:  typeof spec.rot === 'number' ? spec.rot : 0,
  });
  let cached = stickerImgCache[spec.file];
  if (!cached) {
    cached = new Image();
    cached.decoding = 'async';
    cached.src = spec.file;
    stickerImgCache[spec.file] = cached;
  }
  selectedStickerIdx = stickers.length - 1;
  updateStickerSelectionUI();
  if (cached.complete && cached.naturalWidth > 0) buildStrip();
  else cached.addEventListener('load', () => buildStrip(), { once: true });
  showToast((spec.name || 'Sticker') + ' added drag to move');
}

// rAF-coalesced redraw pointermove fires faster than we can repaint, so
// we just flip a flag and let the next animation frame draw once.
//
// Sticker drag fast-path: the heavy work (bg, photos, frame, captions) is
// snapshotted into _baseCanvas after each full buildStrip(). During drag we
// just blit that cached base + draw stickers orders of magnitude cheaper
// than re-rasterizing 4 large photos every frame.
let _rafPending = false;
let _baseCanvas = null;

function scheduleRedraw() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => { _rafPending = false; redrawStickersOnly(); });
}

// ── Drag ghost overlay ─────────────────────────────────────────────────
// Repainting a 1080×3500 canvas every pointermove is the dominant cost on
// low-end Android / older iPhone. Even with dirty-rect optimization the
// browser still recomposites the full canvas to the screen each frame.
// During an active gesture we instead:
//   1. Hide the touched sticker from the canvas (skip in drawAllStickers).
//   2. Render it once as an absolutely-positioned <img> over the canvas.
//   3. Update only its CSS `transform` per pointermove — GPU-accelerated,
//      zero canvas redraws, smooth even with 50+ stickers.
// On pointerup we remove the ghost and do one full buildStrip().
let _dragGhost = null;
let _hiddenStickerIdx = null;
let _ghostRafPending = false;

function ensureRelativeParent(el) {
  const parent = el && el.parentElement;
  if (!parent) return null;
  if (getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }
  return parent;
}

function startDragGhost(idx) {
  if (idx == null || !stickers[idx]) return;
  const parent = ensureRelativeParent(stripCanvas);
  if (!parent) return;
  // Remove any prior ghost defensively
  if (_dragGhost && _dragGhost.parentNode) _dragGhost.parentNode.removeChild(_dragGhost);
  const st = stickers[idx];
  const ghost = document.createElement('img');
  ghost.src = st.file;
  ghost.draggable = false;
  ghost.alt = '';
  ghost.style.position = 'absolute';
  ghost.style.left = '0';
  ghost.style.top = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.willChange = 'transform';
  ghost.style.transformOrigin = 'center center';
  ghost.style.userSelect = 'none';
  ghost.style.webkitUserSelect = 'none';
  ghost.style.zIndex = '5';
  parent.appendChild(ghost);
  _dragGhost = ghost;
  _hiddenStickerIdx = idx;
  // Clear the sticker from the canvas via the dirty-rect fast path so the
  // ghost is the only on-screen copy. Avoids a full buildStrip() at gesture
  // start (which would re-rasterize all photos & frame decorations).
  if (_baseCanvas
      && stripCanvas.width === _baseCanvas.width
      && stripCanvas.height === _baseCanvas.height) {
    redrawStickersOnly();
  } else {
    buildStrip();
  }
  updateDragGhost();
}

function updateDragGhost() {
  if (!_dragGhost || _hiddenStickerIdx == null) return;
  const st = stickers[_hiddenStickerIdx];
  if (!st) return;
  const canvasRect = stripCanvas.getBoundingClientRect();
  const parent = stripCanvas.parentElement;
  const parentRect = parent ? parent.getBoundingClientRect() : { left: canvasRect.left, top: canvasRect.top };
  const cssW = canvasRect.width;
  const cssH = canvasRect.height;
  const img = stickerImgCache[st.file];
  const aspect = (img && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : 1;
  const drawW = st.size * cssW;
  const drawH = drawW * aspect;
  const cx = st.x * cssW + (canvasRect.left - parentRect.left);
  const cy = st.y * cssH + (canvasRect.top - parentRect.top);
  const rotDeg = ((st.rot || 0) * 180) / Math.PI;
  _dragGhost.style.width = drawW + 'px';
  _dragGhost.style.height = drawH + 'px';
  _dragGhost.style.transform =
    'translate3d(' + (cx - drawW / 2) + 'px,' + (cy - drawH / 2) + 'px,0) rotate(' + rotDeg + 'deg)';
}

function scheduleGhostUpdate() {
  if (_ghostRafPending) return;
  _ghostRafPending = true;
  requestAnimationFrame(() => { _ghostRafPending = false; updateDragGhost(); });
}

function endDragGhost() {
  const wasHidden = _hiddenStickerIdx != null;
  if (_dragGhost && _dragGhost.parentNode) _dragGhost.parentNode.removeChild(_dragGhost);
  _dragGhost = null;
  _hiddenStickerIdx = null;
  if (wasHidden) buildStrip();
}

let selectedStickerIdx = null;

function updateStickerSelectionUI() {
  const controls = document.getElementById('sticker-selection-controls');
  if (!controls) return;
  if (selectedStickerIdx !== null) {
    controls.classList.remove('hidden');
  } else {
    controls.classList.add('hidden');
  }
}

// Dirty-rect rendering: instead of repainting the full strip canvas (very
// expensive on tall layouts like 4-cut, 6-cut, 9-cut, puri 4-cut where the
// canvas can be 1080×3000+ pixels), compute the union of all sticker bounding
// boxes (current frame + previous frame, padded for handles) and only clear
// + redraw that region. Stickers outside the dirty region keep last frame's
// pixels — correct, since they didn't move. Big win on mobile.
let _prevDirty = null;
// Last-frame text bbox tracked separately so a shrink-gesture always clears
// the previous frame's larger text region.
let _prevTextBox = null;
// Index of the sticker currently being interacted with (drag/resize/rotate).
// Set by setupCanvasDrag handlers; null means "no active gesture, full redraw".
let _activeStickerIdx = null;

// Bitmap (rasterized) cache for SVG stickers. SVG → drawImage on a 2D canvas
// re-rasterizes the vector tree on every draw on most mobile browsers, which
// is expensive. Once an SVG Image has loaded, we paint it once into a regular
// <canvas> and reuse the bitmap. Big speedup when many stickers are visible.
const _stickerBitmap = {};
const BITMAP_TARGET = 384; // base raster size; renderer scales down/up cleanly

function getStickerBitmap(file, srcImg) {
  if (!srcImg || !srcImg.complete || !srcImg.naturalWidth) return null;
  const cached = _stickerBitmap[file];
  if (cached) return cached;
  const aspect = srcImg.naturalHeight / srcImg.naturalWidth;
  const w = BITMAP_TARGET;
  const h = Math.max(1, Math.round(BITMAP_TARGET * aspect));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  try {
    c.getContext('2d').drawImage(srcImg, 0, 0, w, h);
    _stickerBitmap[file] = c;
    return c;
  } catch (e) {
    return null;
  }
}

function stickerBBox(i) {
  const st = stickers[i];
  if (!st) return null;
  const sw = stripCanvas.width, sh = stripCanvas.height;
  const img = stickerImgCache[st.file];
  const aspect = (img && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : 1;
  const drawW = st.size * sw;
  const drawH = drawW * aspect;
  const cx = st.x * sw, cy = st.y * sh;
  const half = Math.hypot(drawW, drawH) / 2;
  const pad = (i === selectedStickerIdx) ? Math.max(40, sw * 0.04) : 4;
  return {
    x: Math.max(0, Math.floor(cx - half - pad)),
    y: Math.max(0, Math.floor(cy - half - pad)),
    w: Math.min(sw, Math.ceil(cx + half + pad)) - Math.max(0, Math.floor(cx - half - pad)),
    h: Math.min(sh, Math.ceil(cy + half + pad)) - Math.max(0, Math.floor(cy - half - pad)),
  };
}

function computeStickersBBox() {
  if (!stickers.length) return null;
  // During an active gesture only the moving sticker dirty-rects; other
  // stickers haven't moved so their pixels are still valid from last frame.
  if (_activeStickerIdx !== null) return stickerBBox(_activeStickerIdx);
  // Otherwise (initial paint, post-build, etc.) cover all stickers.
  let acc = null;
  for (let i = 0; i < stickers.length; i++) acc = unionRect(acc, stickerBBox(i));
  return acc;
}

function rectsIntersect(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function redrawStickersOnly() {
  if (!_baseCanvas
      || stripCanvas.width !== _baseCanvas.width
      || stripCanvas.height !== _baseCanvas.height) {
    buildStrip();
    return;
  }
  // Include both the current AND previous text bbox in the dirty rect so a
  // shrinking resize gesture never leaves ghosted glyphs from a larger prior
  // frame. _prevDirty alone isn't enough — it gets reset on buildStrip etc.
  const stickerBox = computeStickersBBox();
  const textBox = customText.trim() ? getCustomTextBBox() : null;
  const cur = unionRect(stickerBox, unionRect(textBox, _prevTextBox));
  const dirty = unionRect(_prevDirty, cur);
  if (!dirty || dirty.w <= 0 || dirty.h <= 0) {
    // No stickers at all — restore base.
    sctx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
    sctx.drawImage(_baseCanvas, 0, 0);
    drawCustomTextOverlay();
    _prevDirty = null;
    _prevTextBox = textBox;
    return;
  }
  sctx.save();
  sctx.beginPath();
  sctx.rect(dirty.x, dirty.y, dirty.w, dirty.h);
  sctx.clip();
  sctx.clearRect(dirty.x, dirty.y, dirty.w, dirty.h);
  sctx.drawImage(
    _baseCanvas,
    dirty.x, dirty.y, dirty.w, dirty.h,
    dirty.x, dirty.y, dirty.w, dirty.h,
  );
  drawAllStickers(dirty);
  sctx.restore();
  drawCustomTextOverlay();
  _prevDirty = cur;
  _prevTextBox = textBox;
}

function drawAllStickers(dirtyRect) {
  hideStripSkeleton();
  const sw = stripCanvas.width, sh = stripCanvas.height;
  stickers.forEach((st, i) => {
    // Skip the sticker currently rendered as a CSS-transform ghost overlay.
    if (i === _hiddenStickerIdx) return;
    const img = stickerImgCache[st.file];
    if (!img || !img.complete || !img.naturalWidth) return;
    // Cull stickers whose bbox doesn't intersect the dirty rect — saves
    // setup + drawImage cost when many stickers are present and only one
    // is being dragged (its bbox is the dirty rect).
    if (dirtyRect) {
      const bb = stickerBBox(i);
      if (bb && !rectsIntersect(bb, dirtyRect)) return;
    }
    const sizePx = st.size * sw;
    const aspect = img.naturalHeight / img.naturalWidth;
    const drawW = sizePx;
    const drawH = sizePx * aspect;
    const cx = st.x * sw;
    const cy = st.y * sh;
    const rot = st.rot || 0;

    // Prefer pre-rasterized bitmap (much faster than re-rasterizing SVG
    // vector data on each frame). Falls back to the original Image if the
    // bitmap can't be created (e.g. CORS-tainted source).
    const drawSrc = getStickerBitmap(st.file, img) || img;

    sctx.save();
    sctx.translate(cx, cy);
    if (rot) sctx.rotate(rot);
    sctx.drawImage(drawSrc, -drawW / 2, -drawH / 2, drawW, drawH);

    if (i === selectedStickerIdx) {
      // Bounding box (in rotated frame so it follows the sticker)
      sctx.strokeStyle = 'rgba(0, 153, 255, 0.8)';
      sctx.lineWidth = 2;
      sctx.setLineDash([6, 4]);
      sctx.strokeRect(-drawW / 2 - 4, -drawH / 2 - 4, drawW + 8, drawH + 8);
      sctx.setLineDash([]);

      const handleR = Math.max(18, sw * 0.022);

      // Delete handle (red circle with X) — top-right corner of bbox
      drawHandle(sctx, drawW / 2 + 4, -drawH / 2 - 4, handleR, '#e0344a', drawXMark);
      // Rotate handle (green circle with curved arrow) — top-left corner
      drawHandle(sctx, -drawW / 2 - 4, -drawH / 2 - 4, handleR, '#22a06b', drawRotateMark);
    }
    sctx.restore();
  });
}

function drawHandle(ctx, hx, hy, r, fill, drawIcon) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.lineCap = 'round';
  drawIcon(ctx, hx, hy, r);
  ctx.restore();
}

function drawXMark(ctx, hx, hy, r) {
  const k = r * 0.42;
  ctx.beginPath();
  ctx.moveTo(hx - k, hy - k); ctx.lineTo(hx + k, hy + k);
  ctx.moveTo(hx + k, hy - k); ctx.lineTo(hx - k, hy + k);
  ctx.stroke();
}

function drawRotateMark(ctx, hx, hy, r) {
  // Circular arrow ~3/4 around with arrow head at end.
  const ar = r * 0.5;
  ctx.beginPath();
  ctx.arc(hx, hy, ar, -Math.PI * 0.85, Math.PI * 0.65);
  ctx.stroke();
  // Arrow head at end of arc (angle Math.PI * 0.65)
  const ang = Math.PI * 0.65;
  const ax = hx + Math.cos(ang) * ar;
  const ay = hy + Math.sin(ang) * ar;
  const ah = r * 0.32;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - ah * Math.cos(ang - 0.6), ay - ah * Math.sin(ang - 0.6));
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + ah * Math.cos(ang + 0.6) * 0.6, ay + ah * Math.sin(ang + 0.6) * 0.6);
  ctx.stroke();
}

// ── Sticker interaction: drag, wheel resize, pinch resize ──
function setupCanvasDrag() {
  let dragging = null;
  let resizing = null;
  let rotating = null;
  let draggingText = false;
  let resizingText = null;
  let textOffX = 0, textOffY = 0;
  let offX = 0, offY = 0;
  let pinch = null;
  let pinchText = null;

  // Hit-test the customText overlay. Returns true if pointer is inside the
  // text's bounding box.
  function isTextHit(p) {
    const bb = getCustomTextBBox();
    if (!bb) return false;
    const sw = stripCanvas.width, sh = stripCanvas.height;
    const px = p.x * sw, py = p.y * sh;
    return px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h;
  }

  // Cache the canvas rect during a gesture so we don't force layout on
  // every touchmove (which is a big mobile bottleneck). Refreshed on each
  // gesture start, and on scroll/resize while a gesture is active.
  let _cachedRect = null;
  function refreshRect() { _cachedRect = stripCanvas.getBoundingClientRect(); }
  window.addEventListener('scroll', () => { if (_cachedRect) refreshRect(); }, { passive: true });
  window.addEventListener('resize', () => { if (_cachedRect) refreshRect(); }, { passive: true });

  function rel(touch) {
    const rect = _cachedRect || stripCanvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height,
    };
  }
  function relE(e) { return rel(e.touches ? e.touches[0] : e); }

  // Top-most sticker whose bbox contains p. The bbox is sized in fractional
  // coords using the canvas aspect ratio so circles stay circles on screen.
  function findStickerAt(p) {
    const aspect = stripCanvas.height / stripCanvas.width;
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      const hw = s.size / 2;
      const hh = (s.size / aspect) / 2;
      if (Math.abs(p.x - s.x) < hw && Math.abs(p.y - s.y) < hh) return i;
    }
    return -1;
  }
  // Hit-test the bottom-right corner zone (resize handle area).
  function isCornerHit(p, i) {
    const s = stickers[i];
    const aspect = stripCanvas.height / stripCanvas.width;
    const hw = s.size / 2;
    const hh = (s.size / aspect) / 2;
    return (p.x > s.x + hw * 0.45) && (p.y > s.y + hh * 0.45);
  }
  // Compute world-space position of a corner handle on the selected sticker,
  // accounting for rotation. cornerSign: { sx: ±1, sy: ±1 } picks which corner.
  // sx=+1,sy=-1 = top-right (delete). sx=-1,sy=-1 = top-left (rotate).
  function handlePos(i, cornerSign) {
    const s = stickers[i];
    const sw = stripCanvas.width, sh = stripCanvas.height;
    const img = stickerImgCache[s.file];
    const aspect = (img && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : 1;
    const drawW = s.size * sw;
    const drawH = drawW * aspect;
    const cx = s.x * sw, cy = s.y * sh;
    const lx = cornerSign.sx * (drawW / 2 + 4);
    const ly = cornerSign.sy * (drawH / 2 + 4);
    const rot = s.rot || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos, sw, sh };
  }
  function isHandleHit(p, hxhy) {
    const sw = stripCanvas.width;
    const handleR = Math.max(18, sw * 0.022);
    const tapR = handleR + 8;
    const px = p.x * sw, py = p.y * stripCanvas.height;
    return Math.hypot(px - hxhy.x, py - hxhy.y) <= tapR;
  }
  function isDeleteHit(p, i) {
    if (i !== selectedStickerIdx) return false;
    return isHandleHit(p, handlePos(i, { sx: 1, sy: -1 }));
  }
  function isRotateHit(p, i) {
    if (i !== selectedStickerIdx) return false;
    return isHandleHit(p, handlePos(i, { sx: -1, sy: -1 }));
  }

  stripCanvas.addEventListener('mousedown', onDown);
  stripCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onTouchEnd);
  stripCanvas.addEventListener('wheel', onWheel, { passive: false });

  function onDown(e) {
    refreshRect();
    const p = relE(e);

    // Custom text drag takes priority over sticker hits when the pointer is
    // inside the text bbox — it sits on top of stickers visually so it
    // should be grabbable from the same area.
    if (customText.trim() && isTextHit(p)) {
      // Bottom-right ~30% of the text bbox = resize handle zone (same pattern
      // as sticker corner resize). The rest of the bbox = drag-to-move.
      const bb = getCustomTextBBox();
      const sw = stripCanvas.width, sh = stripCanvas.height;
      const px = p.x * sw, py = p.y * sh;
      if (bb && px > bb.x + bb.w * 0.70 && py > bb.y + bb.h * 0.55) {
        resizingText = { startX: p.x, startSize: customTextSize };
        e.preventDefault();
        return;
      }
      draggingText = true;
      textOffX = p.x - customTextPos.x;
      textOffY = p.y - customTextPos.y;
      e.preventDefault();
      return;
    }

    if (!stickers.length) return;

    // Tapped the X handle on the currently selected sticker → delete it.
    if (selectedStickerIdx !== null && isDeleteHit(p, selectedStickerIdx)) {
      stickers.splice(selectedStickerIdx, 1);
      selectedStickerIdx = null;
      updateStickerSelectionUI();
      buildStrip();
      e.preventDefault();
      return;
    }
    // Tapped the rotate handle → start rotation drag.
    if (selectedStickerIdx !== null && isRotateHit(p, selectedStickerIdx)) {
      const s = stickers[selectedStickerIdx];
      const sw = stripCanvas.width, sh = stripCanvas.height;
      const cx = s.x * sw, cy = s.y * sh;
      const px = p.x * sw, py = p.y * sh;
      rotating = {
        i: selectedStickerIdx,
        startAngle: Math.atan2(py - cy, px - cx),
        startRot: s.rot || 0,
      };
      _activeStickerIdx = selectedStickerIdx;
      startDragGhost(selectedStickerIdx);
      e.preventDefault();
      return;
    }

    const i = findStickerAt(p);

    if (i !== selectedStickerIdx) {
      selectedStickerIdx = i >= 0 ? i : null;
      updateStickerSelectionUI();
      scheduleRedraw();
    }

    if (i < 0) return;
    if (isCornerHit(p, i)) {
      resizing = { i, startX: p.x, startSize: stickers[i].size };
    } else {
      dragging = i;
      offX = p.x - stickers[i].x;
      offY = p.y - stickers[i].y;
    }
    _activeStickerIdx = i;
    startDragGhost(i);
    e.preventDefault();
  }
  function onMove(e) {
    if (resizingText) {
      e.preventDefault();
      const p = relE(e);
      // Map horizontal drag delta to font-size delta. Sensitivity ~0.3 keeps
      // the resize gesture matching the visible movement.
      const dx = p.x - resizingText.startX;
      customTextSize = Math.max(0.025, Math.min(0.20, resizingText.startSize + dx * 0.3));
      scheduleRedraw();
      return;
    }
    if (draggingText) {
      e.preventDefault();
      const p = relE(e);
      customTextPos.x = Math.max(0, Math.min(1, p.x - textOffX));
      customTextPos.y = Math.max(0, Math.min(1, p.y - textOffY));
      scheduleRedraw();
      return;
    }
    if (rotating !== null) {
      e.preventDefault();
      const p = relE(e);
      const s = stickers[rotating.i];
      const sw = stripCanvas.width, sh = stripCanvas.height;
      const cx = s.x * sw, cy = s.y * sh;
      const px = p.x * sw, py = p.y * sh;
      const angle = Math.atan2(py - cy, px - cx);
      s.rot = rotating.startRot + (angle - rotating.startAngle);
      if (_dragGhost) scheduleGhostUpdate(); else scheduleRedraw();
      return;
    }
    if (resizing !== null) {
      e.preventDefault();
      const p = relE(e);
      const dx = p.x - resizing.startX;
      stickers[resizing.i].size = clampSize(resizing.startSize + dx * 1.6);
      if (_dragGhost) scheduleGhostUpdate(); else scheduleRedraw();
      return;
    }
    if (dragging === null) return;
    e.preventDefault();
    const p = relE(e);
    stickers[dragging].x = Math.max(0, Math.min(1, p.x - offX));
    stickers[dragging].y = Math.max(0, Math.min(1, p.y - offY));
    if (_dragGhost) scheduleGhostUpdate(); else scheduleRedraw();
  }
  function onUp() {
    dragging = null; resizing = null; rotating = null;
    if (draggingText) {
      draggingText = false;
      buildStrip();
    }
    if (resizingText) {
      resizingText = null;
      buildStrip();
    }
    _activeStickerIdx = null; _cachedRect = null;
    endDragGhost();
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      refreshRect();
      const p = rel(e.touches[0]);
      // Two-finger pinch on text overlay = resize text
      if (customText.trim() && isTextHit(p)) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchText = { dist: Math.hypot(dx, dy), size0: customTextSize };
        e.preventDefault();
        return;
      }
      if (stickers.length) {
        const i = findStickerAt(p);
        const idx = i >= 0 ? i : stickers.length - 1;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinch = { i: idx, dist: Math.hypot(dx, dy), size0: stickers[idx].size };
        _activeStickerIdx = idx;
        startDragGhost(idx);
        e.preventDefault();
        return;
      }
    }
    onDown(e);
  }
  function onTouchMove(e) {
    if (pinchText && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      customTextSize = Math.max(0.025, Math.min(0.20, pinchText.size0 * (dist / pinchText.dist)));
      scheduleRedraw();
      e.preventDefault();
      return;
    }
    if (pinch && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      stickers[pinch.i].size = clampSize(pinch.size0 * (dist / pinch.dist));
      if (_dragGhost) scheduleGhostUpdate(); else scheduleRedraw();
      e.preventDefault();
      return;
    }
    onMove(e);
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) { pinch = null; pinchText = null; }
    onUp();
  }

  function onWheel(e) {
    const p = relE(e);
    // Scroll wheel over text = resize text
    if (customText.trim() && isTextHit(p)) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      customTextSize = Math.max(0.025, Math.min(0.20, customTextSize * factor));
      scheduleRedraw();
      return;
    }
    if (!stickers.length) return;
    const i = findStickerAt(p);
    if (i < 0) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    stickers[i].size = clampSize(stickers[i].size * factor);
    scheduleRedraw();
  }
}

function clampSize(v) { return Math.max(0.04, Math.min(0.6, v)); }

// ── Background removal (AI cutout) ──
// Lazy-loads @imgly/background-removal from a CDN on first toggle-on, processes
// every shot into a transparent PNG, and caches the result via the WeakMap so
// subsequent renders (color changes, layout switches) are instant.
function loadBgLib() {
  if (_bgLibPromise) return _bgLibPromise;
  _bgLibPromise = import('https://esm.sh/@imgly/background-removal@1.4.5')
    .then(m => m.default || m)
    .catch(err => {
      _bgLibPromise = null;
      throw err;
    });
  return _bgLibPromise;
}

// Network-aware: returns 'fast' | 'slow' | 'unknown'. iOS Safari doesn't
// expose navigator.connection so we treat it as unknown and rely on the
// reactive timers below instead.
function detectConnectionSpeed() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return 'unknown';
  if (c.saveData) return 'slow';
  const t = c.effectiveType;
  if (t === 'slow-2g' || t === '2g') return 'slow';
  if (t === '3g' && c.downlink && c.downlink < 1.5) return 'slow';
  return 'fast';
}

function setBgRemoveStatus(text) {
  const el = document.getElementById('bgremove-status');
  if (el) el.textContent = text;
}

function showBgOverlay(text, percent) {
  const overlay = document.getElementById('bgremove-overlay');
  const txt     = document.getElementById('bgremove-overlay-text');
  const bar     = document.getElementById('bgremove-overlay-bar');
  if (!overlay) return;
  overlay.classList.add('active');
  if (txt && text != null) txt.textContent = text;
  if (bar && percent != null) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
}

function hideBgOverlay() {
  const overlay = document.getElementById('bgremove-overlay');
  if (overlay) overlay.classList.remove('active');
}

async function processShotCutout(shotImg) {
  if (cutouts.has(shotImg)) return cutouts.get(shotImg);
  const lib = await loadBgLib();
  const removeBackground = lib.removeBackground || lib;
  // Force CPU mode + non-worker for max compatibility on Android Chrome,
  // Samsung Internet, and any browser that lacks SharedArrayBuffer (which
  // requires COOP/COEP headers GitHub Pages doesn't send).
  const opts = { device: 'cpu', output: { format: 'image/png' } };
  let blob;
  try {
    blob = await removeBackground(shotImg.src, opts);
  } catch (e) {
    console.error('[bg-remove] removeBackground threw:', e);
    const err = new Error(e && e.message ? e.message : 'bg-remove-failed');
    err.cause = e;
    throw err;
  }
  if (!blob || !blob.size) {
    console.error('[bg-remove] empty blob returned');
    throw new Error('bg-remove-empty-blob');
  }
  const url = URL.createObjectURL(blob);
  const cutout = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = (ev) => {
      console.error('[bg-remove] cutout image failed to decode', ev);
      rej(new Error('bg-remove-decode-failed'));
    };
    im.src = url;
  });
  cutouts.set(shotImg, cutout);
  return cutout;
}

async function processAllShotsForBg() {
  if (!shots.length) return;
  const pending = shots.filter(s => s && !cutouts.has(s));
  if (!pending.length) return;
  _bgInflight = pending.length;
  setBgRemoveStatus(`Processing ${_bgInflight} photo${_bgInflight === 1 ? '' : 's'}…`);
  showBgOverlay(`Processing photo 1 of ${pending.length}…`, 5);
  for (let i = 0; i < pending.length; i++) {
    const label = `Processing photo ${i + 1} of ${pending.length}…`;
    setBgRemoveStatus(label);
    // 5% slot for "starting", then linear ramp from there to 95% as photos
    // finish. We show progress BEFORE each photo starts so the bar visibly
    // moves even on the first photo (which takes the longest due to model warm-up).
    const startPct = 5 + (i / pending.length) * 90;
    showBgOverlay(label, startPct);
    try {
      await processShotCutout(pending[i]);
      const donePct = 5 + ((i + 1) / pending.length) * 90;
      showBgOverlay(label, donePct);
      if (bgRemoveOn) buildStrip();
    } catch (e) {
      console.error('[bg-remove] failed on photo', i + 1, e);
      // Surface a more useful diagnosis. Common Android failure modes:
      // SharedArrayBuffer missing (GitHub Pages lacks COOP/COEP headers),
      // out-of-memory on low-RAM devices, or WebAssembly init failure.
      const msg = (e && e.message) || '';
      let userMsg;
      if (/SharedArrayBuffer|crossOriginIsolated/i.test(msg)) {
        userMsg = 'Your browser is missing a security feature this needs. Try Chrome on desktop.';
      } else if (/memory|allocation/i.test(msg)) {
        userMsg = 'Not enough memory on this device — close other tabs and retry.';
      } else if (/network|fetch|load|404/i.test(msg)) {
        userMsg = 'Could not download the AI model. Check your connection.';
      } else {
        userMsg = 'BG removal not supported on this device/browser.';
      }
      setBgRemoveStatus(userMsg);
      showBgOverlay(userMsg, 0);
      setTimeout(hideBgOverlay, 3500);
      _bgInflight = 0;
      return;
    }
  }
  _bgInflight = 0;
  setBgRemoveStatus(`On — ${shots.length} photo${shots.length === 1 ? '' : 's'} cut out`);
  showBgOverlay('Done ✨', 100);
  setTimeout(hideBgOverlay, 600);
}

function initBgRemove() {
  const toggle = document.getElementById('bgremove-toggle');
  if (!toggle) return;

  toggle.addEventListener('change', async () => {
    bgRemoveOn = toggle.checked;
    if (!bgRemoveOn) {
      setBgRemoveStatus('Off — original backgrounds shown');
      buildStrip();
      return;
    }
    if (!shots.length) {
      setBgRemoveStatus('Add photos first, then turn this on.');
      toggle.checked = false;
      bgRemoveOn = false;
      return;
    }
    // First-use requires downloading the ~25MB model — bail early if offline
    // so the user gets a clear message instead of a 60s hang then timeout.
    if (!_bgLibPromise && navigator.onLine === false) {
      const msg = 'You appear to be offline. Connect to Wi-Fi or data to use this feature.';
      setBgRemoveStatus(msg);
      showBgOverlay(msg, 0);
      setTimeout(hideBgOverlay, 2800);
      toggle.checked = false;
      bgRemoveOn = false;
      return;
    }
    // Proactive: if we can detect a slow connection up front, warn the user
    // before they spend 30s wondering if the app is frozen.
    const speed = detectConnectionSpeed();
    const slowConnUpfront = speed === 'slow';
    const initialMsg = slowConnUpfront
      ? 'Slow connection detected — model download may take a while…'
      : 'Loading AI model… (first use ~25MB)';
    setBgRemoveStatus(initialMsg);
    showBgOverlay(initialMsg, slowConnUpfront ? 1 : 2);

    // Reactive: even if we couldn't detect speed (iOS Safari), watch the wall
    // clock. If the model is still loading after 8s / 20s / 40s, update the
    // overlay so users know it's the network, not the app.
    const slowTimers = [
      setTimeout(() => showBgOverlay('Still loading — your connection seems slow…', 8), 8000),
      setTimeout(() => showBgOverlay('Almost there — slow network is the culprit…', 14), 20000),
      setTimeout(() => showBgOverlay('Hanging on — model is still downloading…', 18), 40000),
    ];
    const clearSlowTimers = () => slowTimers.forEach(clearTimeout);

    try {
      await loadBgLib();
    } catch {
      clearSlowTimers();
      const msg = navigator.onLine
        ? 'Could not load AI model. Try again or refresh the page.'
        : 'You appear to be offline. Reconnect and try again.';
      setBgRemoveStatus(msg);
      showBgOverlay(msg, 0);
      setTimeout(hideBgOverlay, 2400);
      toggle.checked = false;
      bgRemoveOn = false;
      return;
    }
    clearSlowTimers();
    await processAllShotsForBg();
    buildStrip();
  });

  document.querySelectorAll('.bgr-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bgr-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bgRemoveColor = btn.dataset.color;
      const custom = document.getElementById('bgremove-custom-color');
      if (custom) custom.value = bgRemoveColor;
      if (bgRemoveOn) buildStrip();
    });
  });

  const custom = document.getElementById('bgremove-custom-color');
  if (custom) {
    custom.addEventListener('input', e => {
      document.querySelectorAll('.bgr-swatch').forEach(b => b.classList.remove('active'));
      bgRemoveColor = e.target.value;
      if (bgRemoveOn) buildStrip();
    });
  }
}

// ── Tabs ──
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('[data-panel]').forEach(p => {
        p.classList.toggle('hidden', p.dataset.panel !== tab);
      });
    });
  });
}

// ── Download / share ──
// (See app.js for rationale on multi-signal mobile detection.)
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Synchronously convert a data URL to a Blob. Required for iOS where the
// async toBlob() callback fires AFTER user activation has expired, blocking
// navigator.share() and window.open(). toDataURL() runs in the same tick as
// the click handler, preserving the activation window.
function dataURLToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
const IS_ANDROID =
  /Android/i.test(navigator.userAgent) ||
  (navigator.userAgentData && navigator.userAgentData.platform === 'Android') ||
  (!IS_IOS && navigator.maxTouchPoints > 0 && /Mobi|CrMo|FxiOS/i.test(navigator.userAgent));
const IS_MOBILE = IS_IOS || IS_ANDROID;

async function saveBlob(blob, filename, mime) {
  // iOS Safari blocks <a download> for blobs → Web Share is the only path,
  // and its sheet has a real "Save Image" entry. Android's share sheet
  // doesn't show a save button (just apps like Gmail/FB), so we use direct
  // download instead — the file lands in Downloads where the Gallery app
  // auto-indexes it. Desktop also uses direct download.
  if (IS_IOS && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        showToast('Tap "Save Image" to add to Photos');
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      // NotAllowedError = user-activation expired. Fall through to the
      // open-in-new-tab path below so the user can long-press → Save Image.
    }
  }
  const url = URL.createObjectURL(blob);
  // iOS fallback: <a download> doesn't actually save on iOS. Open the image
  // in a new tab so the user can long-press → "Save to Photos".
  // Using an anchor click (vs window.open) survives iOS's popup blocker as
  // long as we're still inside the user-gesture stack.
  if (IS_IOS) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Long-press the photo → Save to Photos');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast(IS_ANDROID
    ? 'Saved! Find it in Files → Downloads'
    : 'Downloaded! Check your Downloads folder');
}

// Fullscreen printer-slot animation: stylized white slot at top of screen
// with the current strip emerging downward out of it. Used on customize
// download + IG exports. The strip is captured as a PNG snapshot of the
// canvas — works on phones since the overlay is fullscreen so the strip is
// always front-and-center, no scrolling needed.
function playPrinterAnim(srcCanvas) {
  const src = srcCanvas || stripCanvas;
  if (!src || !src.width || !src.height) return;
  let dataUrl;
  try { dataUrl = src.toDataURL('image/png'); } catch { return; }

  document.querySelectorAll('.printer-anim-overlay').forEach(n => n.remove());

  const overlay = document.createElement('div');
  overlay.className = 'printer-anim-overlay';
  overlay.innerHTML =
    '<div class="printer-anim-slot"></div>' +
    '<div class="printer-anim-clip"><img class="printer-anim-strip" alt=""></div>';
  const img = overlay.querySelector('img');
  const slot = overlay.querySelector('.printer-anim-slot');
  // Default duration — overridden by syncAnimDuration once the rendered
  // height is known. We track it in a closure so the dismiss timer matches.
  let animDur = 2200;
  function syncSlotWidth() {
    const w = img.getBoundingClientRect().width;
    if (w > 0 && slot) slot.style.width = Math.round(w + 20) + 'px';
  }
  // Scale animation duration to rendered strip height. Short strips
  // (polaroid, photocard, diptych) cover much less pixel distance during
  // the slide-out — without this they're done before the user can tell
  // anything happened. Inverse relationship: smaller strip → longer hold.
  function syncAnimDuration() {
    const h = img.getBoundingClientRect().height;
    if (!h) return;
    animDur = Math.max(2000, Math.min(3500, Math.round(3300 - h * 1.4)));
    img.style.animationDuration = animDur + 'ms';
  }
  img.addEventListener('load', () => requestAnimationFrame(() => {
    syncSlotWidth();
    syncAnimDuration();
  }));
  img.src = dataUrl;
  document.body.appendChild(overlay);
  if (img.complete) requestAnimationFrame(() => { syncSlotWidth(); syncAnimDuration(); });
  requestAnimationFrame(() => overlay.classList.add('go'));

  // Auto-dismiss ~400ms after the (now dynamic) animation finishes.
  const dismissAfter = () => {
    overlay.classList.remove('go');
    overlay.classList.add('gone');
    setTimeout(() => overlay.remove(), 400);
  };
  // Defer scheduling until next frame so animDur reflects the measured value.
  requestAnimationFrame(() => setTimeout(dismissAfter, animDur + 400));

  overlay.addEventListener('click', () => {
    overlay.classList.add('gone');
    setTimeout(() => overlay.remove(), 250);
  });
}

async function downloadStrip() {
  // Hide sticker selection UI (dashed box + delete/rotate handles) so it
  // doesn't get baked into the exported image.
  const savedSel = selectedStickerIdx;
  selectedStickerIdx = null;
  buildStrip();
  const filename = 'BopBooth-' + currentMode + '-' + Date.now() + '.png';

  // iOS: synchronous toDataURL keeps navigator.share / window.open inside
  // the user-activation window. The async toBlob() callback fires AFTER the
  // click handler returns — iOS revokes activation by then and both share
  // and popup paths silently fail (the actual cause of the reported issue).
  if (IS_IOS) {
    let dataUrl;
    try { dataUrl = stripCanvas.toDataURL('image/png'); }
    catch (e) {
      if (savedSel !== null) { selectedStickerIdx = savedSel; buildStrip(); }
      showToast('Could not save image');
      return;
    }
    const blob = dataURLToBlob(dataUrl);
    if (savedSel !== null) { selectedStickerIdx = savedSel; buildStrip(); }
    saveBlob(blob, filename, 'image/png');
    playPrinterAnim();
    return;
  }

  // Android / desktop: async toBlob is fine — saves memory for large canvases.
  stripCanvas.toBlob(blob => {
    if (savedSel !== null) {
      selectedStickerIdx = savedSel;
      buildStrip();
    }
    if (!blob) { showToast('Could not save image'); return; }
    saveBlob(blob, filename, 'image/png');
  }, 'image/png');
  playPrinterAnim();
}

// Brightness check (sRGB) so we can flip wordmark / shadow contrast
// against dark export backgrounds without the user having to think about it.
function isDarkColor(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return false;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

// Compose the current strip onto a colored backdrop at a target aspect
// ratio (used for IG Story 9:16 and IG Square 1:1 exports).
async function exportComposed(canvasW, canvasH, filename, padding = 0.06, bgColor = '#FAF6EE') {
  // Hide sticker selection UI so it doesn't get baked into the IG export.
  const savedSel = selectedStickerIdx;
  selectedStickerIdx = null;
  await Promise.resolve(buildStrip());
  const out = document.createElement('canvas');
  out.width = canvasW;
  out.height = canvasH;
  const octx = out.getContext('2d');

  // User-chosen backdrop
  octx.fillStyle = bgColor;
  octx.fillRect(0, 0, canvasW, canvasH);

  const dark = isDarkColor(bgColor);

  // Subtle texture so it doesn't look flat — light overlay on dark, dark on light
  octx.fillStyle = dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(60, 40, 20, 0.02)';
  octx.fillRect(0, 0, canvasW, canvasH);

  // Fit the strip with padding, preserving aspect ratio
  const padX = canvasW * padding;
  const padY = canvasH * padding;
  const maxW = canvasW - padX * 2;
  const maxH = canvasH - padY * 2;
  const sw = stripCanvas.width;
  const sh = stripCanvas.height;
  const scale = Math.min(maxW / sw, maxH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (canvasW - dw) / 2;
  const dy = (canvasH - dh) / 2;

  // Soft drop shadow for the strip — deeper on dark backgrounds
  octx.shadowColor = dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(60, 40, 20, 0.18)';
  octx.shadowBlur = 32;
  octx.shadowOffsetY = 8;
  octx.drawImage(stripCanvas, dx, dy, dw, dh);
  octx.shadowColor = 'transparent';
  octx.shadowBlur = 0;
  octx.shadowOffsetY = 0;

  // BopBooth wordmark — color follows backdrop
  octx.fillStyle = dark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(60, 40, 20, 0.5)';
  octx.font = 'italic ' + Math.round(canvasW * 0.028) + 'px "DM Serif Display", serif';
  octx.textAlign = 'center';
  octx.fillText('bopbooth.com', canvasW / 2, canvasH - padY * 0.45);

  out.toBlob(blob => {
    if (savedSel !== null) {
      selectedStickerIdx = savedSel;
      buildStrip();
    }
    if (!blob) { showToast('Could not save image'); return; }
    saveBlob(blob, filename, 'image/png');
  }, 'image/png');
}

// Open the bg-color picker modal and resolve with the user's choice
// (or null if they cancel). Used for both Story and Post IG exports.
let __bgPickerSelected = '#FAF6EE';
let __bgPickerAspect   = 9 / 16;   // default to Story 9:16; set per export

// Pre-render a small thumbnail of the strip canvas once when the picker
// opens. The preview then just paints a colored background and drawImage's
// this thumbnail on top — much faster than re-rendering the full strip on
// every swipe.
let __stripThumb = null;
function rebuildStripThumbnail() {
  if (!stripCanvas || !stripCanvas.width) { __stripThumb = null; return; }
  const TARGET_LONG = 240; // logical px for the thumbnail's longer dimension
  const sw = stripCanvas.width, sh = stripCanvas.height;
  const scale = TARGET_LONG / Math.max(sw, sh);
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(stripCanvas, 0, 0, tw, th);
  __stripThumb = c;
}

function renderBgPickerPreview(color) {
  const preview = document.getElementById('bg-picker-preview');
  if (!preview) return;
  // Match preview canvas's aspect to the current export target (9:16 or 1:1)
  const PREVIEW_W = 360;
  const PREVIEW_H = Math.round(PREVIEW_W / __bgPickerAspect);
  preview.width = PREVIEW_W;
  preview.height = PREVIEW_H;
  const ctx = preview.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
  // Subtle texture so the bg doesn't look flat — mirrors exportComposed
  const dark = isDarkColor(color);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(60,40,20,0.02)';
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
  if (__stripThumb) {
    const pad = PREVIEW_W * 0.07;
    const maxW = PREVIEW_W - pad * 2;
    const maxH = PREVIEW_H - pad * 2;
    const t = __stripThumb;
    const s = Math.min(maxW / t.width, maxH / t.height);
    const dw = t.width * s, dh = t.height * s;
    const dx = (PREVIEW_W - dw) / 2;
    const dy = (PREVIEW_H - dh) / 2;
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(60,40,20,0.18)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(t, dx, dy, dw, dh);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  // Wordmark mirrors exportComposed
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.65)' : 'rgba(60,40,20,0.5)';
  ctx.font = 'italic ' + Math.round(PREVIEW_W * 0.030) + 'px "DM Serif Display", serif';
  ctx.textAlign = 'center';
  ctx.fillText('bopbooth.com', PREVIEW_W / 2, PREVIEW_H - (PREVIEW_W * 0.07) * 0.5);
}

function pickBackgroundColor(label, aspect) {
  return new Promise(resolve => {
    const overlay = document.getElementById('bg-picker-overlay');
    const desc    = document.getElementById('bg-picker-desc');
    const rail    = document.getElementById('bg-picker-rail');
    const swatches = rail ? rail.querySelectorAll('.bg-rail-swatch') : [];
    const custom  = document.getElementById('bg-picker-custom');
    const confirm = document.getElementById('bg-picker-confirm');
    const close   = document.getElementById('bg-picker-close');
    const nameEl  = document.getElementById('bg-picker-color-name');
    if (!overlay || !rail) { resolve('#FAF6EE'); return; }

    desc.textContent = label || 'Swipe to try colors — preview updates live.';
    __bgPickerAspect = aspect || (9 / 16);

    // Cache a thumbnail of the strip ONCE per modal open so preview redraws
    // are instant on every swipe (no full strip rebuild).
    rebuildStripThumbnail();

    let picked = __bgPickerSelected;
    let pickedName = 'Cream';
    custom.value = /^#[0-9a-f]{6}$/i.test(picked) ? picked : '#FAF6EE';

    function setPicked(c, name) {
      picked = c;
      if (name) { pickedName = name; nameEl.textContent = name; }
      swatches.forEach(s => s.classList.toggle('is-active', s.dataset.color.toLowerCase() === c.toLowerCase()));
      renderBgPickerPreview(c);
    }

    overlay.classList.add('open');

    // Initial: scroll the rail so the previously-selected color sits in the
    // center (under the marker).
    requestAnimationFrame(() => {
      const target = Array.from(swatches).find(s => s.dataset.color.toLowerCase() === picked.toLowerCase()) || swatches[0];
      if (target) {
        const railRect = rail.getBoundingClientRect();
        const btnRect = target.getBoundingClientRect();
        const targetLeft = target.offsetLeft - (railRect.width / 2) + (btnRect.width / 2);
        rail.scrollTo({ left: targetLeft, behavior: 'auto' });
        setPicked(target.dataset.color, target.dataset.name);
      } else {
        setPicked(picked, pickedName);
      }
    });

    // Live detect which swatch is closest to the center marker as user scrolls
    let scrollRAF = null;
    function onScroll() {
      if (scrollRAF) return;
      scrollRAF = requestAnimationFrame(() => {
        scrollRAF = null;
        const railRect = rail.getBoundingClientRect();
        const centerX = railRect.left + railRect.width / 2;
        let bestEl = null, bestDist = Infinity;
        swatches.forEach(s => {
          const r = s.getBoundingClientRect();
          const d = Math.abs((r.left + r.width / 2) - centerX);
          if (d < bestDist) { bestDist = d; bestEl = s; }
        });
        if (bestEl && bestEl.dataset.color.toLowerCase() !== picked.toLowerCase()) {
          setPicked(bestEl.dataset.color, bestEl.dataset.name);
          custom.value = bestEl.dataset.color;
        }
      });
    }
    function onSwatchTap(e) {
      const btn = e.target.closest('.bg-rail-swatch');
      if (!btn) return;
      // Scroll-snap to this swatch so it lands under the center marker
      const railRect = rail.getBoundingClientRect();
      const targetLeft = btn.offsetLeft - (railRect.width / 2) + (btn.clientWidth / 2);
      rail.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
    function onCustom() {
      setPicked(custom.value, 'Custom');
    }
    function done(color) {
      overlay.classList.remove('open');
      rail.removeEventListener('scroll', onScroll);
      rail.removeEventListener('click', onSwatchTap);
      custom.removeEventListener('input', onCustom);
      confirm.removeEventListener('click', onConfirm);
      close.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      resolve(color);
    }
    function onConfirm() { __bgPickerSelected = picked; done(picked); }
    function onCancel()  { done(null); }
    function onBackdrop(e) { if (e.target === overlay) onCancel(); }

    rail.addEventListener('scroll', onScroll, { passive: true });
    rail.addEventListener('click', onSwatchTap);
    custom.addEventListener('input', onCustom);
    confirm.addEventListener('click', onConfirm);
    close.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
  });
}

async function downloadStory() {
  // 9:16 aspect → tall preview
  const bg = await pickBackgroundColor('Swipe to try colors for your IG Story (9:16) — preview updates live.', 9 / 16);
  if (!bg) return;
  playPrinterAnim();
  setTimeout(() => exportComposed(1080, 1920, 'BopBooth-story-' + Date.now() + '.png', 0.07, bg), 2000);
}
async function downloadSquare() {
  // 1:1 aspect → square preview
  const bg = await pickBackgroundColor('Swipe to try colors for your IG Post (1:1) — preview updates live.', 1);
  if (!bg) return;
  playPrinterAnim();
  setTimeout(() => exportComposed(1080, 1080, 'BopBooth-square-' + Date.now() + '.png', 0.07, bg), 2000);
}

async function shareStrip() {
  // Hide sticker selection UI so it doesn't get baked into the shared image.
  const savedSel = selectedStickerIdx;
  selectedStickerIdx = null;
  await Promise.resolve(buildStrip());
  const restoreSelection = () => {
    if (savedSel !== null) {
      selectedStickerIdx = savedSel;
      buildStrip();
    }
  };
  try {
    if (navigator.share && navigator.canShare) {
      stripCanvas.toBlob(async blob => {
        restoreSelection();
        const file = new File([blob], 'BopBooth.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'My BopBooth photo!' });
        } else fallbackCopy();
      }, 'image/png');
    } else { restoreSelection(); fallbackCopy(); }
  } catch { restoreSelection(); fallbackCopy(); }
}

function fallbackCopy() {
  stripCanvas.toBlob(blob => {
    try {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => showToast('Copied to clipboard!'))
        .catch(() => showToast('Right-click to save'));
    } catch { showToast('Right-click to save'); }
  }, 'image/png');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Replace photos ──
// Downscale large uploads to a sane max dimension while preserving the
// original aspect ratio — the strip renderer will fit them with `contain`
// so nothing gets cropped.
function normalizeUploaded(srcImg) {
  const MAX = 1600;
  let w = srcImg.width, h = srcImg.height;
  if (w > MAX || h > MAX) {
    if (w >= h) { h = Math.round(h * (MAX / w)); w = MAX; }
    else        { w = Math.round(w * (MAX / h)); h = MAX; }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(srcImg, 0, 0, w, h);
  return new Promise(res => {
    const out = new Image();
    out.onload = () => res(out);
    out.src = c.toDataURL('image/jpeg', 0.92);
  });
}

async function replacePhotos(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  const max  = maxShots();
  const visible = Math.min(shots.length, max);
  // If all visible slots in the current layout are filled, treat the new
  // selection as a fresh replace. Otherwise append into the empty slots.
  let working = visible >= max ? [] : shots.slice();
  const room  = max - working.length;
  const picked = files.slice(0, room || max);

  showToast('Loading photos…');
  for (const file of picked) {
    if (working.length >= max) break;
    const dataUrl = await new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });
    const raw = await new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = dataUrl;
    });
    working.push(await normalizeUploaded(raw));
  }

  shots = working;
  // Reset offsets for replaced photos so old positioning doesn't carry over
  photoOffsets = shots.map(() => ({ ox: 0, oy: 0 }));
  buildStrip();
  updateUploadCounter();
  if (typeof renderAdjustPanel === 'function') renderAdjustPanel();
  // If background removal is on, process the newly uploaded photos.
  if (bgRemoveOn) processAllShotsForBg().then(() => buildStrip());
  const filled = Math.min(shots.length, max);
  if (filled >= max) showToast('All slots filled!');
  else               showToast(`${filled}/${max} uploaded keep going`);
  document.getElementById('replace-input').value = '';

  // On mobile (stacked layout) the preview is above the tools panel, so the
  // user can't see the result of their upload. Scroll the strip into view.
  if (window.matchMedia('(max-width: 1023px)').matches) {
    requestAnimationFrame(() => {
      const target = document.getElementById('strip-canvas');
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
}

// ── Init ──
document.getElementById('download-btn').addEventListener('click', downloadStrip);
document.getElementById('print-btn')?.addEventListener('click', () => {
  if (!shots.length) { showToast('Add photos before printing'); return; }
  buildStrip();
  setTimeout(() => window.print(), 80);
});
document.getElementById('share-btn').addEventListener('click', shareStrip);
document.getElementById('download-story-btn')?.addEventListener('click', downloadStory);
document.getElementById('download-square-btn')?.addEventListener('click', downloadSquare);
document.getElementById('replace-btn').addEventListener('click', () => {
  document.getElementById('replace-input').click();
});
document.getElementById('replace-input').addEventListener('change', e => replacePhotos(e.target.files));
const clearBtn = document.getElementById('clear-photos-btn');
if (clearBtn) clearBtn.addEventListener('click', clearAllPhotos);

// Custom text input — rebuilds the strip on every keystroke, which is the
// heaviest single op on the page. Debounce so we only rebuild once the user
// pauses typing; cheap on phones / weak CPUs.
function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
const customTextInput = document.getElementById('custom-text-input');
const customTextClear = document.getElementById('custom-text-clear');
if (customTextInput) {
  const debouncedRebuild = debounce(buildStrip, 180);
  customTextInput.addEventListener('input', e => {
    const wasEmpty = !customText.trim();
    customText = e.target.value;
    // First non-empty keystroke after empty: recenter so a fresh text
    // always appears in the middle of the strip.
    if (wasEmpty && customText.trim()) {
      customTextPos = { x: 0.5, y: 0.5 };
    }
    debouncedRebuild();
  });
}
if (customTextClear) {
  customTextClear.addEventListener('click', () => {
    customText = '';
    if (customTextInput) customTextInput.value = '';
    customTextPos = { x: 0.5, y: 0.5 };
    buildStrip();
  });
}

// Font picker — choose the typeface for the custom title
const fontPicker = document.getElementById('font-picker');
if (fontPicker) {
  fontPicker.innerHTML = TITLE_FONT_OPTIONS.map(f => {
    const previewStyle = `font-family:${f.family};font-weight:${f.weight.trim() || 400};${f.id==='serif-italic'?'font-style:italic;':''}`;
    return `<button type="button" class="font-pill${f.id===customFont?' active':''}" data-font="${f.id}" style="${previewStyle}">${f.label}</button>`;
  }).join('');
  fontPicker.addEventListener('click', e => {
    const btn = e.target.closest('.font-pill');
    if (!btn) return;
    customFont = btn.dataset.font;
    fontPicker.querySelectorAll('.font-pill').forEach(b => b.classList.toggle('active', b === btn));
    buildStrip();
  });
}

// Size slider for custom text
const customTextSizeInput = document.getElementById('custom-text-size');
if (customTextSizeInput) {
  customTextSizeInput.value = customTextSize;
  const debouncedSize = debounce(buildStrip, 60);
  customTextSizeInput.addEventListener('input', e => {
    customTextSize = parseFloat(e.target.value);
    debouncedSize();
  });
}

// Color swatches for custom text
const ctSwatches = document.getElementById('custom-text-color-swatches');
const ctCustomInput = document.getElementById('custom-text-color-custom');
function setTextColor(color, sourceBtn) {
  customTextColor = color;
  if (ctSwatches) {
    ctSwatches.querySelectorAll('.ct-swatch').forEach(b => b.classList.remove('active'));
    if (sourceBtn) sourceBtn.classList.add('active');
  }
  buildStrip();
}
if (ctSwatches) {
  ctSwatches.addEventListener('click', e => {
    const btn = e.target.closest('.ct-swatch');
    if (!btn) return;
    setTextColor(btn.dataset.color, btn);
  });
}
if (ctCustomInput) {
  ctCustomInput.addEventListener('input', e => {
    setTextColor(e.target.value, null);
  });
}

// Footer visibility toggle (date only — wordmark always shown)
const dateToggle = document.getElementById('toggle-date');
if (dateToggle) {
  dateToggle.addEventListener('change', e => {
    showDate = e.target.checked;
    buildStrip();
  });
}

// ── Adjust panel: per-photo crop sliders ──
function renderAdjustPanel() {
  const list = document.getElementById('adjust-list');
  if (!list) return;
  list.innerHTML = '';
  if (!shots.length) {
    list.innerHTML = '<p class="text-xs text-muted italic">Upload photos first to reposition them.</p>';
    return;
  }
  shots.forEach((img, i) => {
    if (!photoOffsets[i]) photoOffsets[i] = { ox: 0, oy: 0 };
    const off = photoOffsets[i];
    const row = document.createElement('div');
    row.className = 'p-3 rounded-xl bg-cream2/40 border border-sand/40 flex gap-3 items-center';
    row.innerHTML = `
      <img src="${img.src}" alt="" class="w-14 h-14 rounded-lg object-cover border border-sand/60 shrink-0">
      <div class="flex-1 flex flex-col gap-2">
        <div class="text-[11px] font-medium uppercase tracking-[0.18em] text-ink2">Photo ${i + 1}</div>
        <label class="flex items-center gap-2 text-[11px] text-muted">
          <span class="w-5">↔</span>
          <input type="range" min="-1" max="1" step="0.02" value="${off.ox}" data-axis="ox" data-idx="${i}" class="flex-1 accent-ink">
        </label>
        <label class="flex items-center gap-2 text-[11px] text-muted">
          <span class="w-5">↕</span>
          <input type="range" min="-1" max="1" step="0.02" value="${off.oy}" data-axis="oy" data-idx="${i}" class="flex-1 accent-ink">
        </label>
      </div>
    `;
    list.appendChild(row);
  });
  // Coalesce slider input via rAF instead of a timer — gives 1 redraw per
  // frame (max), so slider feels instant on capable devices and gracefully
  // drops frames on slow phones without queuing up stale rebuilds.
  let rafQueued = false;
  function flushAdjust() {
    rafQueued = false;
    buildStrip();
  }
  function onSliderInput(e) {
    const idx = parseInt(e.target.dataset.idx, 10);
    const axis = e.target.dataset.axis;
    if (!photoOffsets[idx]) photoOffsets[idx] = { ox: 0, oy: 0 };
    photoOffsets[idx][axis] = parseFloat(e.target.value);
    renderScale = 0.5;
    if (!rafQueued) { rafQueued = true; requestAnimationFrame(flushAdjust); }
  }
  function onSliderRelease() {
    renderScale = 1;
    buildStrip();
  }
  list.querySelectorAll('input[type="range"]').forEach(input => {
    input.addEventListener('input', onSliderInput);
    input.addEventListener('change', onSliderRelease);
    input.addEventListener('pointerup', onSliderRelease);
    input.addEventListener('touchend', onSliderRelease);
  });
}
const resetAdjustBtn = document.getElementById('reset-adjust');
if (resetAdjustBtn) {
  resetAdjustBtn.addEventListener('click', () => {
    photoOffsets = shots.map(() => ({ ox: 0, oy: 0 }));
    renderAdjustPanel();
    buildStrip();
  });
}
// Re-render the panel whenever the user opens it (in case shots changed).
document.querySelector('button[data-tab="adjust"]')?.addEventListener('click', renderAdjustPanel);

initTabs();
initLayoutGrid();
initTemplateGrid();
initFrameGrid();
initColorSwatches();
initStickerGrid();
initBgRemove();
setupCanvasDrag();
loadShots().then(renderAdjustPanel);
updateUploadCounter();
