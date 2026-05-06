// ── State ──
let currentMode  = sessionStorage.getItem('sb_mode')   || '4cut';
let currentFrame = 'strip';
let bgOverride   = null;  // null | { type:'solid', color } | { type:'pattern', img }
let currentTemplate = null;  // null | template id from TEMPLATES
let stickers     = [];
let shots        = [];
let customText   = '';
// Per-photo crop offsets keyed by shot index. ox/oy in [-1, 1] where 0 is
// centered. Negative values shift the visible window towards the top/left
// (so the bottom/right of the photo shows more), positive does the inverse.
let photoOffsets = [];
// Multiplier applied to canvas dimensions. Drops to 0.5 during interactive
// adjustments so weak phones can keep up; restored to 1 when interaction
// ends so downloads stay full quality.
let renderScale = 1;
// Footer visibility toggles (Text tab → Footer section)
let showWordmark = true;
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
      <div class="lm-shape" style="grid-template-columns:repeat(${L.shape.cols},1fr);grid-template-rows:repeat(${L.shape.rows},1fr);">${cells}</div>
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

  if (currentMode !== 'photocard' && !bgOverride) drawFrameDecorations(sctx, currentFrame, sw, sh);

  // Themed frame title in the top reserved zone replaced by user's
  // custom text when provided. Falls back to bottom space (e.g. polaroid,
  // photocard) when there's no usable top area.
  const topReserve = positions[0] ? positions[0].y : 0;
  const lastPos = positions[positions.length - 1];
  const bottomReserve = lastPos ? Math.max(0, sh - (lastPos.y + lastPos.h)) : 0;
  const txt = customText.trim();
  if (txt) {
    sctx.fillStyle = 'rgba(0,0,0,0.85)';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    if (topReserve >= 30) {
      const fs = Math.min(72, Math.max(36, Math.floor(topReserve * 0.42)));
      sctx.font = 'italic ' + fs + 'px "DM Serif Display", serif';
      sctx.fillText(txt, sw/2, topReserve/2 + 6);
    } else if (bottomReserve >= 30) {
      const fs = Math.min(64, Math.max(28, Math.floor(bottomReserve * 0.38)));
      sctx.font = 'italic ' + fs + 'px "DM Serif Display", serif';
      sctx.fillText(txt, sw/2, sh - bottomReserve/2);
    }
    sctx.textAlign = 'start';
    sctx.textBaseline = 'alphabetic';
  } else if (topReserve > 30) {
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
        drawCoverImage(sctx, img, 0, 0, w, h, off.ox, off.oy);
        sctx.restore();
      } else {
        drawCoverImage(sctx, img, x, y, w, h, off.ox, off.oy);
      }
      sctx.strokeStyle = 'rgba(0,0,0,0.08)';
      sctx.lineWidth = 1;
      sctx.strokeRect(x, y, w, h);
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

  if (currentMode === 'polaroid' || currentMode === 'double-polaroid') {
    const BB=90, BT=20;
    sctx.textAlign = 'center';
    if (showWordmark) {
      sctx.fillStyle = 'rgba(0,0,0,0.35)';
      sctx.font = '500 26px DM Sans, sans-serif';
      sctx.fillText('SnapBooth', sw/2, sh - BB*0.6);
    }
    if (showDate) {
      sctx.font = '18px DM Sans, sans-serif'; sctx.fillStyle = 'rgba(0,0,0,0.2)';
      sctx.fillText(new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), sw/2, sh - BB*0.3);
    }
    sctx.textAlign = 'start';
  }
  if (currentMode === 'photocard') {
    const BT=30, BB=100;
    sctx.textAlign = 'center';
    if (showWordmark) {
      sctx.fillStyle = 'rgba(0,0,0,0.4)';
      sctx.font = '500 30px DM Sans, sans-serif';
      sctx.fillText('SnapBooth', sw/2, H+BT+BB*0.36);
    }
    if (showDate) {
      sctx.font = '20px DM Sans, sans-serif'; sctx.fillStyle = 'rgba(0,0,0,0.25)';
      sctx.fillText(new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}), sw/2, H+BT+BB*0.62);
    }
    sctx.textAlign = 'start';
  }

  const stripModes = ['4cut','3cut','2cut'];
  const multi = ['6cut','3horiz','squaregrid','grid4','1large3small','4plus1'];
  if (stripModes.includes(currentMode)) {
    // Polaroid-style footer mirroring app.js buildStrip
    const BOT = 220;
    const footerTop = sh - BOT;
    sctx.textAlign = 'center';
    if (showWordmark) {
      sctx.fillStyle = 'rgba(0,0,0,0.5)';
      sctx.font = '500 36px "DM Serif Display", serif';
      sctx.fillText('SnapBooth', sw/2, footerTop + BOT * 0.55);
    }
    if (showDate) {
      sctx.font = '400 22px "DM Sans", sans-serif';
      sctx.fillStyle = 'rgba(0,0,0,0.3)';
      sctx.fillText(
        new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
        sw/2, footerTop + BOT * 0.78
      );
    }
    sctx.textAlign = 'start';
  } else if (multi.includes(currentMode)) {
    if (showWordmark) {
      sctx.fillStyle = 'rgba(0,0,0,0.78)';
      sctx.font = 'italic 42px "DM Serif Display", serif';
      sctx.textAlign = 'center';
      sctx.fillText('snapbooth', sw/2, sh - 22);
      sctx.textAlign = 'start';
    }
  } else if (currentMode !== 'photocard' && currentMode !== 'polaroid' && currentMode !== 'double-polaroid' && currentMode !== 'tilt3') {
    if (showWordmark) {
      // Single-shot / fallback: small bottom-right watermark
      sctx.fillStyle = 'rgba(0,0,0,0.5)';
      sctx.font = 'italic 22px "DM Serif Display", serif';
      sctx.textAlign = 'right';
      sctx.fillText('snapbooth', sw - 16, sh - 14);
      sctx.textAlign = 'start';
    }
  }

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
}

// ── Tilt3 layout: dark red strip with 3 slightly-tilted black-bordered
// photo slots and a "SNAPBOOTH / your text" footer (matches the Canva
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
      drawCoverImage(sctx, img, -W / 2, -H / 2, W, H, off.ox, off.oy);
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

  // Footer text: SNAPBOOTH + custom subline
  sctx.fillStyle = '#FAF6EE';
  sctx.textAlign = 'center';
  sctx.font = Math.floor(BOT * 0.34) + 'px "DM Serif Display", serif';
  sctx.fillText('SNAPBOOTH', sw / 2, sh - BOT * 0.55);

  sctx.font = 'italic ' + Math.floor(BOT * 0.22) + 'px "DM Serif Display", serif';
  sctx.fillStyle = 'rgba(250,246,238,0.92)';
  sctx.fillText(customText.trim() || 'your text', sw / 2, sh - BOT * 0.22);
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
        drawCoverImage(sctx, img, x, y, w, h, off.ox, off.oy);
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
      sctx.strokeStyle = 'rgba(0,0,0,0.12)';
      sctx.lineWidth = 1;
      sctx.strokeRect(x, y, w, h);
    });

    // Custom text overlay on templates: place in available top or bottom
    // space relative to the first/last slot.
    const txt = customText.trim();
    if (txt) {
      const firstSlot = tpl.slots[0];
      const lastSlot = tpl.slots[tpl.slots.length - 1];
      const topRes = firstSlot.y * sh;
      const bottomRes = sh - (lastSlot.y + lastSlot.h) * sh;
      sctx.fillStyle = 'rgba(0,0,0,0.85)';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      if (topRes >= 30) {
        const fs = Math.min(72, Math.max(28, Math.floor(topRes * 0.42)));
        sctx.font = 'italic ' + fs + 'px "DM Serif Display", serif';
        sctx.fillText(txt, sw/2, topRes/2 + 6);
      } else if (bottomRes >= 30) {
        const fs = Math.min(64, Math.max(24, Math.floor(bottomRes * 0.38)));
        sctx.font = 'italic ' + fs + 'px "DM Serif Display", serif';
        sctx.fillText(txt, sw/2, sh - bottomRes/2);
      }
      sctx.textAlign = 'start';
      sctx.textBaseline = 'alphabetic';
    }

    // Snapshot for sticker drag fast-path
    if (!_baseCanvas) _baseCanvas = document.createElement('canvas');
    if (_baseCanvas.width !== sw || _baseCanvas.height !== sh) {
      _baseCanvas.width = sw; _baseCanvas.height = sh;
    }
    const bctx = _baseCanvas.getContext('2d');
    bctx.clearRect(0, 0, sw, sh);
    bctx.drawImage(stripCanvas, 0, 0);
    drawAllStickers();
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
        stickers.push({ file: s.file, x: 0.5, y: 0.6, size: 0.16 });
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

function redrawStickersOnly() {
  if (!_baseCanvas
      || stripCanvas.width !== _baseCanvas.width
      || stripCanvas.height !== _baseCanvas.height) {
    buildStrip();
    return;
  }
  sctx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
  sctx.drawImage(_baseCanvas, 0, 0);
  drawAllStickers();
}

function drawAllStickers() {
  hideStripSkeleton();
  const sw = stripCanvas.width, sh = stripCanvas.height;
  stickers.forEach((st, i) => {
    const img = stickerImgCache[st.file];
    if (!img || !img.complete) return;
    const sizePx = st.size * sw;
    const half = sizePx / 2;
    const cx = st.x * sw;
    const cy = st.y * sh;
    sctx.drawImage(img, cx - half, cy - half, sizePx, sizePx);

    // Draw subtle bounding box if selected
    if (i === selectedStickerIdx) {
      sctx.save();
      sctx.strokeStyle = 'rgba(0, 153, 255, 0.8)';
      sctx.lineWidth = 2;
      sctx.setLineDash([6, 4]);
      sctx.strokeRect(cx - half - 4, cy - half - 4, sizePx + 8, sizePx + 8);
      sctx.restore();
    }
  });
}

// ── Sticker interaction: drag, wheel resize, pinch resize ──
function setupCanvasDrag() {
  let dragging = null;
  let resizing = null;
  let offX = 0, offY = 0;
  let pinch = null;

  function rel(touch) {
    const rect = stripCanvas.getBoundingClientRect();
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

  stripCanvas.addEventListener('mousedown', onDown);
  stripCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onTouchEnd);
  stripCanvas.addEventListener('wheel', onWheel, { passive: false });

  function onDown(e) {
    if (!stickers.length) return;
    const p = relE(e);
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
    e.preventDefault();
  }
  function onMove(e) {
    if (resizing !== null) {
      e.preventDefault();
      const p = relE(e);
      const dx = p.x - resizing.startX;
      stickers[resizing.i].size = clampSize(resizing.startSize + dx * 1.6);
      scheduleRedraw();
      return;
    }
    if (dragging === null) return;
    e.preventDefault();
    const p = relE(e);
    stickers[dragging].x = Math.max(0, Math.min(1, p.x - offX));
    stickers[dragging].y = Math.max(0, Math.min(1, p.y - offY));
    scheduleRedraw();
  }
  function onUp() { dragging = null; resizing = null; }

  function onTouchStart(e) {
    if (e.touches.length === 2 && stickers.length) {
      const p = rel(e.touches[0]);
      const i = findStickerAt(p);
      const idx = i >= 0 ? i : stickers.length - 1;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch = { i: idx, dist: Math.hypot(dx, dy), size0: stickers[idx].size };
      e.preventDefault();
      return;
    }
    onDown(e);
  }
  function onTouchMove(e) {
    if (pinch && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      stickers[pinch.i].size = clampSize(pinch.size0 * (dist / pinch.dist));
      scheduleRedraw();
      e.preventDefault();
      return;
    }
    onMove(e);
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) pinch = null;
    onUp();
  }

  function onWheel(e) {
    if (!stickers.length) return;
    const p = relE(e);
    const i = findStickerAt(p);
    if (i < 0) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    stickers[i].size = clampSize(stickers[i].size * factor);
    scheduleRedraw();
  }
}

function clampSize(v) { return Math.max(0.04, Math.min(0.6, v)); }

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
async function downloadStrip() {
  await Promise.resolve(buildStrip());
  const a = document.createElement('a');
  a.download = 'snapbooth-' + currentMode + '-' + Date.now() + '.png';
  a.href = stripCanvas.toDataURL('image/png');
  a.click();
  showToast('Downloaded!');
}

// Compose the current strip onto a colored backdrop at a target aspect
// ratio (used for IG Story 9:16 and IG Square 1:1 exports).
async function exportComposed(canvasW, canvasH, filename, padding = 0.06) {
  await Promise.resolve(buildStrip());
  const out = document.createElement('canvas');
  out.width = canvasW;
  out.height = canvasH;
  const octx = out.getContext('2d');

  // Cream backdrop matching the site palette
  octx.fillStyle = '#FAF6EE';
  octx.fillRect(0, 0, canvasW, canvasH);

  // Subtle texture so it doesn't look flat
  octx.fillStyle = 'rgba(60, 40, 20, 0.02)';
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

  // Soft drop shadow for the strip
  octx.shadowColor = 'rgba(60, 40, 20, 0.18)';
  octx.shadowBlur = 32;
  octx.shadowOffsetY = 8;
  octx.drawImage(stripCanvas, dx, dy, dw, dh);
  octx.shadowColor = 'transparent';
  octx.shadowBlur = 0;
  octx.shadowOffsetY = 0;

  // SnapBooth wordmark in the bottom margin so the export carries the brand
  octx.fillStyle = 'rgba(60, 40, 20, 0.5)';
  octx.font = 'italic ' + Math.round(canvasW * 0.028) + 'px "DM Serif Display", serif';
  octx.textAlign = 'center';
  octx.fillText('snapbooth.app', canvasW / 2, canvasH - padY * 0.45);

  const a = document.createElement('a');
  a.download = filename;
  a.href = out.toDataURL('image/png');
  a.click();
  showToast('Downloaded!');
}

function downloadStory() {
  exportComposed(1080, 1920, 'snapbooth-story-' + Date.now() + '.png', 0.07);
}
function downloadSquare() {
  exportComposed(1080, 1080, 'snapbooth-square-' + Date.now() + '.png', 0.07);
}

async function shareStrip() {
  await Promise.resolve(buildStrip());
  try {
    if (navigator.share && navigator.canShare) {
      stripCanvas.toBlob(async blob => {
        const file = new File([blob], 'snapbooth.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'My SnapBooth photo!' });
        } else fallbackCopy();
      }, 'image/png');
    } else fallbackCopy();
  } catch { fallbackCopy(); }
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
  const filled = Math.min(shots.length, max);
  if (filled >= max) showToast('All slots filled!');
  else               showToast(`${filled}/${max} uploaded keep going`);
  document.getElementById('replace-input').value = '';
}

// ── Init ──
document.getElementById('download-btn').addEventListener('click', downloadStrip);
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
    customText = e.target.value;
    debouncedRebuild();
  });
}
if (customTextClear) {
  customTextClear.addEventListener('click', () => {
    customText = '';
    if (customTextInput) customTextInput.value = '';
    buildStrip();
  });
}

// Footer visibility toggles
const wordmarkToggle = document.getElementById('toggle-wordmark');
const dateToggle = document.getElementById('toggle-date');
if (wordmarkToggle) {
  wordmarkToggle.addEventListener('change', e => {
    showWordmark = e.target.checked;
    buildStrip();
  });
}
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
setupCanvasDrag();
loadShots().then(renderAdjustPanel);
updateUploadCounter();
