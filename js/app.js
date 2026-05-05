// ── State ──
let currentFilter  = 'none';
let currentFrame   = 'strip';
let currentMode    = '4cut';
var currentTimer   = 3;
let shots          = [];
let stickers       = [];
let isRunning      = false;
let stream         = null;
let currentGifBlob = null;
let cameraReady    = false;

// ── DOM refs ──
const video         = document.getElementById('video');
const canvas        = document.getElementById('canvas');
const overlayCanvas = document.getElementById('overlay-canvas');
const stripCanvas   = document.getElementById('strip-canvas');
const gifResult     = document.getElementById('gif-result');

const ctx  = canvas.getContext('2d');
const octx = overlayCanvas.getContext('2d');
const sctx = stripCanvas.getContext('2d');

// ── Camera state ──
function showCameraState(state) {
  const stateEl   = document.getElementById('cam-state');
  const idleEl    = document.getElementById('cam-idle');
  const loadingEl = document.getElementById('cam-loading');
  const errorEl   = document.getElementById('cam-error');

  if (state === 'ready') {
    stateEl.style.opacity       = '0';
    stateEl.style.pointerEvents = 'none';
    video.classList.add('cam-active');
    return;
  }
  stateEl.style.opacity       = '1';
  stateEl.style.pointerEvents = 'auto';
  idleEl.style.display    = state === 'idle'    ? 'flex' : 'none';
  loadingEl.style.display = state === 'loading' ? 'flex' : 'none';
  errorEl.style.display   = state === 'error'   ? 'flex' : 'none';
}

async function enableCamera() {
  if (cameraReady) return true;
  showCameraState('loading');

  // Try tiers from highest → lowest. Android Chrome silently picks a low
  // track if you only specify `ideal`, so we try `min` first to force HD,
  // then progressively relax if the device can't satisfy.
  const tiers = [
    { video: { facingMode: 'user', width: { min: 1280, ideal: 1920 }, height: { min: 720, ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'user' }, audio: false },
  ];

  for (const constraints of tiers) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      stream = null;
    }
  }

  if (!stream) {
    showCameraState('error');
    return false;
  }

  try {
    video.srcObject = stream;
    await video.play();
    // Use the actual track resolution the browser chose — never fall back
    // to 640×480 which would crop captures to low-res even when the
    // stream is HD.
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    canvas.width         = video.videoWidth  || settings.width  || 1280;
    canvas.height        = video.videoHeight || settings.height || 720;
    overlayCanvas.width  = canvas.width;
    overlayCanvas.height = canvas.height;
    cameraReady = true;
    showCameraState('ready');
    return true;
  } catch (e) {
    showCameraState('error');
    console.error(e);
    return false;
  }
}

async function initCamera() {
  try {
    const perm = await navigator.permissions.query({ name: 'camera' });
    if (perm.state === 'granted') await enableCamera();
  } catch {}
}

video.addEventListener('loadedmetadata', () => {
  canvas.width         = video.videoWidth;
  canvas.height        = video.videoHeight;
  overlayCanvas.width  = canvas.width;
  overlayCanvas.height = canvas.height;
});

// ── Modes ──
const MODE_SHOTS = {
  '4cut': 4, '3cut': 3, '2cut': 2, '6cut': 6, '3horiz': 3,
  'squaregrid': 4, '1large3small': 4, 'grid4': 4, 'single': 1, 'polaroid': 1,
  'double-polaroid': 2, 'photocard': 1, 'gif': 1, 'tilt3': 3,
};

function maxShots() { return MODE_SHOTS[currentMode] || 1; }

function setMode(m) {
  currentMode = m;
  document.querySelectorAll('.layout-card, .sc-card').forEach(b => b.classList.remove('active'));
  const card = document.getElementById('mode-' + m);
  if (card) {
    card.classList.add('active');
    // Scroll carousel to center the selected layout card
    const scrollContainer = document.getElementById('layout-scroll');
    if (scrollContainer) {
      const targetLeft = card.offsetLeft - scrollContainer.offsetLeft - (scrollContainer.clientWidth / 2) + (card.clientWidth / 2);
      // Use setTimeout to ensure DOM is ready and painting has caught up before scrolling
      setTimeout(() => scrollContainer.scrollTo({ left: targetLeft, behavior: 'smooth' }), 50);
    }
  }

  shots = []; stickers = []; currentGifBlob = null;
  updateShotDots();

  const snapLabel = document.getElementById('snap-label');
  const dlLabel   = document.getElementById('download-label');
  if (m === 'gif') {
    snapLabel.textContent = 'Record GIF';
    dlLabel.textContent   = 'Download GIF';
  } else {
    snapLabel.textContent = 'Capture';
    dlLabel.textContent   = 'Download PNG';
  }

  const nameEl = document.getElementById('mode-indicator-name');
  const countEl = document.getElementById('mode-indicator-count');
  if (nameEl && countEl) {
    const label = card && card.querySelector('.sc-label') ? card.querySelector('.sc-label').textContent : m;
    nameEl.textContent = label;
    const count = maxShots();
    if (m === 'gif') countEl.textContent = 'Animated';
    else countEl.textContent = count + (count === 1 ? ' shot' : ' shots');
  }
}

// ── Filters ──
function setFilter(id, btn) {
  currentFilter = id;
  // Actually apply the CSS filter to the live preview
  const v = document.getElementById('video');
  const css = (typeof FILTER_CSS !== 'undefined' && FILTER_CSS[id]) || 'none';
  if (v) {
    // Use setProperty with !important to win over any conflicting styles
    v.style.setProperty('filter', css, 'important');
    v.style.setProperty('-webkit-filter', css, 'important');
  }
  console.log('[setFilter]', id, '→', css);
  // Toggle .active state on buttons
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Update the burger label and close the panel
  const lbl = document.getElementById('filters-active-label');
  if (lbl) lbl.textContent = '· ' + (btn && btn.dataset.name || id);
  const panel  = document.getElementById('filters-panel');
  const toggle = document.getElementById('filters-toggle');
  if (panel && !panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
}

// Wire up filter clicks
document.querySelectorAll('.filter-btn').forEach(b => {
  b.addEventListener('click', () => setFilter(b.dataset.f, b));
});

// ── Shot dots ──
function updateShotDots() {
  const max = maxShots();
  const sc  = document.getElementById('shot-counter');
  sc.innerHTML = '';
  if (max < 2) return;
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'shot-dot' + (i < shots.length ? ' taken' : '');
    sc.appendChild(d);
  }
}

// ── Countdown / flash ──
function countdown(n) {
  return new Promise(resolve => {
    const el = document.getElementById('countdown');
    let c = n;
    el.textContent = c;
    el.classList.add('show');
    const iv = setInterval(() => {
      c--;
      if (c <= 0) { clearInterval(iv); el.classList.remove('show'); resolve(); }
      else el.textContent = c;
    }, 1000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function flashEffect() {
  const f = document.getElementById('flash');
  f.classList.add('pop');
  setTimeout(() => f.classList.remove('pop'), 120);
}

function captureFrame() {
  return new Promise(resolve => {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    applyFilterToCanvas(currentFilter);
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL('image/jpeg', 0.92);
  });
}

// ── Sessions ──
async function startPhotoSession() {
  const max = maxShots();
  shots = []; stickers = [];
  updateShotDots();
  // isRunning + button-disabled were set in startSession()
  document.getElementById('rec-ring').classList.add('active');

  for (let i = 0; i < max; i++) {
    if (shots.length >= max) break;
    await countdown(currentTimer);
    flashEffect();
    const img = await captureFrame();
    if (shots.length >= max) break;
    shots.push(img);
    updateShotDots();
    if (i < max - 1) await sleep(600);
  }

  document.getElementById('rec-ring').classList.remove('active');
  document.getElementById('snap-btn').disabled = false;
  isRunning = false;
  shots = shots.slice(0, max);
  buildStrip();
  openPreview();
  showToast('Photo strip ready!');
}

async function startGifSession() {
  // isRunning + button-disabled were set in startSession()
  document.getElementById('rec-ring').classList.add('active');

  await countdown(currentTimer);

  const GIF_W        = 480;
  const GIF_H        = Math.round(GIF_W * (canvas.height / canvas.width));
  const FPS          = 12;
  const DURATION_MS  = 2000;
  const TOTAL_FRAMES = Math.round((FPS * DURATION_MS) / 1000);

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width  = GIF_W;
  tmpCanvas.height = GIF_H;
  const tmpCtx = tmpCanvas.getContext('2d');

  showToast('Recording…');
  const rawFrames = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    applyFilterToCanvas(currentFilter);
    tmpCtx.drawImage(canvas, 0, 0, GIF_W, GIF_H);
    const fc = document.createElement('canvas');
    fc.width = GIF_W; fc.height = GIF_H;
    fc.getContext('2d').drawImage(tmpCanvas, 0, 0);
    rawFrames.push(fc);
    await sleep(1000 / FPS);
  }

  document.getElementById('rec-ring').classList.remove('active');
  encodeGif(rawFrames, GIF_W, GIF_H);
}

function encodeGif(rawFrames, w, h) {
  const progressWrap = document.getElementById('gif-progress');
  const bar          = document.getElementById('gif-progress-bar');
  const label        = document.getElementById('gif-progress-label');
  progressWrap.style.display = 'flex';
  bar.style.width   = '0%';
  label.textContent = 'Encoding GIF…';

  const boomerangFrames = [...rawFrames, ...[...rawFrames].reverse().slice(1, -1)];

  const gif = new GIF({
    workers: 2, quality: 10, width: w, height: h,
    workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
  });

  boomerangFrames.forEach(fc => gif.addFrame(fc, { delay: Math.round(1000 / 12) }));

  gif.on('progress', p => {
    bar.style.width   = (p * 100).toFixed(0) + '%';
    label.textContent = 'Encoding GIF… ' + Math.round(p * 100) + '%';
  });

  gif.on('finished', blob => {
    progressWrap.style.display = 'none';
    isRunning      = false;
    currentGifBlob = blob;
    const url      = URL.createObjectURL(blob);
    gifResult.src  = url;
    gifResult.classList.remove('hidden');
    stripCanvas.style.display = 'none';
    document.getElementById('snap-btn').disabled = false;
    openPreview();
    showToast('GIF boomerang ready!');
  });

  gif.render();
}

async function startSession() {
  if (isRunning) return;
  // Claim the lock BEFORE any await otherwise a quick double-click can
  // spawn two concurrent sessions that both push into `shots`.
  isRunning = true;
  document.getElementById('snap-btn').disabled = true;

  // First-tap behavior: if the camera isn't running yet, turn it on
  // and proceed immediately to the capture session.
  if (!cameraReady) {
    const ok = await enableCamera();
    if (!ok) {
      isRunning = false;
      document.getElementById('snap-btn').disabled = false;
      return;
    }
    const snapLabel = document.getElementById('snap-label');
    if (snapLabel) snapLabel.textContent = currentMode === 'gif' ? 'Record GIF' : 'Capture';
  }

  if (currentMode === 'gif') startGifSession();
  else startPhotoSession();
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const boxAspect = w / h;
  let sx, sy, sw, sh;
  if (imgAspect > boxAspect) {
    sh = img.naturalHeight;
    sw = sh * boxAspect;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / boxAspect;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// ── Build strip ──
function buildStrip() {
  if (!shots.length) return;

  const W = shots[0].naturalWidth  || 640;
  const H = shots[0].naturalHeight || 480;

  // Tilt3 layout: dark red strip, 3 tilted black-bordered photos, footer.
  if (currentMode === 'tilt3') {
    const PAD = 70, GAP = 40, TOP = 70, BOT = 240, BORDER = 18;
    const TILTS = [-1.5, 2, -2];
    const sw = W + PAD * 2;
    const sh = H * 3 + GAP * 2 + TOP + BOT;
    stripCanvas.width = sw; stripCanvas.height = sh;
    sctx.fillStyle = '#5C0000';
    sctx.fillRect(0, 0, sw, sh);
    for (let i = 0; i < 3; i++) {
      const cx = sw / 2;
      const cy = TOP + H / 2 + i * (H + GAP);
      sctx.save();
      sctx.translate(cx, cy);
      sctx.rotate(TILTS[i] * Math.PI / 180);
      sctx.fillStyle = '#0a0a0a';
      sctx.fillRect(-W / 2 - BORDER, -H / 2 - BORDER, W + BORDER * 2, H + BORDER * 2);
      if (shots[i]) sctx.drawImage(shots[i], -W / 2, -H / 2, W, H);
      sctx.restore();
    }
    sctx.fillStyle = '#FAF6EE';
    sctx.textAlign = 'center';
    sctx.font = Math.floor(BOT * 0.34) + 'px "DM Serif Display", serif';
    sctx.fillText('SNAPBOOTH', sw / 2, sh - BOT * 0.55);
    sctx.font = 'italic ' + Math.floor(BOT * 0.22) + 'px "DM Serif Display", serif';
    sctx.fillText('your text', sw / 2, sh - BOT * 0.22);
    sctx.textAlign = 'start';
    return;
  }

  let sw, sh, positions;

  if (currentMode === '4cut') {
    const PAD = 28, GAP = 20, TOP = 90, BOT = 220;
    const pH = Math.round(H * 0.78); // cinematic crop: ~640×374
    sw = W + PAD * 2; sh = pH * 4 + GAP * 3 + TOP + BOT;
    positions = Array.from({ length: 4 }, (_, i) => ({ x: PAD, y: TOP + i * (pH + GAP), w: W, h: pH }));
  } else if (currentMode === '3cut') {
    const PAD = 28, GAP = 20, TOP = 90, BOT = 220;
    const pH = Math.round(H * 0.78);
    sw = W + PAD * 2; sh = pH * 3 + GAP * 2 + TOP + BOT;
    positions = Array.from({ length: 3 }, (_, i) => ({ x: PAD, y: TOP + i * (pH + GAP), w: W, h: pH }));
  } else if (currentMode === '2cut') {
    const PAD = 28, GAP = 20, TOP = 90, BOT = 220;
    const pH = Math.round(H * 0.78);
    sw = W + PAD * 2; sh = pH * 2 + GAP + TOP + BOT;
    positions = Array.from({ length: 2 }, (_, i) => ({ x: PAD, y: TOP + i * (pH + GAP), w: W, h: pH }));
  } else if (currentMode === '6cut') {
    const PAD = 26, GAP = 12, TOP = 80, BOT = 52;
    sw = W * 2 + GAP + PAD * 2; sh = H * 3 + GAP * 2 + TOP + BOT;
    positions = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 2; col++)
        positions.push({ x: PAD + col * (W + GAP), y: TOP + row * (H + GAP), w: W, h: H });
  } else if (currentMode === '3horiz') {
    const PAD = 28, GAP = 14, TOP = 80, BOT = 52;
    const sW = H;
    const sH = W;
    sw = sW * 3 + GAP * 2 + PAD * 2; sh = sH + TOP + BOT;
    positions = Array.from({ length: 3 }, (_, i) => ({ x: PAD + i * (sW + GAP), y: TOP, w: sW, h: sH }));
  } else if (currentMode === 'squaregrid') {
    const PAD = 48, GAP = 12;
    sw = W * 2 + GAP + PAD * 2; sh = H * 2 + GAP + PAD * 2;
    positions = [
      { x: PAD, y: PAD, w: W, h: H },
      { x: PAD + W + GAP, y: PAD, w: W, h: H },
      { x: PAD, y: PAD + H + GAP, w: W, h: H },
      { x: PAD + W + GAP, y: PAD + H + GAP, w: W, h: H },
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
  } else if (currentMode === 'photocard') {
    const BX = 40, BT = 30, BB = 100;
    sw = W + BX * 2; sh = H + BT + BB;
    positions = [{ x: BX, y: BT, w: W, h: H }];
  } else if (currentMode === 'polaroid') {
    const BP = 30, BT = 20, BB = 90;
    sw = W + BP * 2; sh = H + BT + BB;
    positions = [{ x: BP, y: BT, w: W, h: H }];
  } else if (currentMode === 'double-polaroid') {
    const BP = 30, BT = 20, GAP = 50, BB = 90;
    sw = W + BP * 2; sh = H * 2 + GAP + BT + BB;
    positions = [
      { x: BP, y: BT, w: W, h: H },
      { x: BP, y: BT + H + GAP, w: W, h: H },
    ];
  } else {
    const BP = 16;
    sw = W + BP * 2; sh = H + BP * 2;
    positions = [{ x: BP, y: BP, w: W, h: H }];
  }

  stripCanvas.width = sw; stripCanvas.height = sh;

  let bg = currentMode === 'photocard' ? '#ffffff'
         : getFrameBg(currentFrame);
  sctx.fillStyle = bg;
  sctx.fillRect(0, 0, sw, sh);

  if (currentMode !== 'photocard') drawFrameDecorations(sctx, currentFrame, sw, sh);

  shots.slice(0, maxShots()).forEach((img, i) => {
    if (!positions[i]) return;
    const { x, y, w, h } = positions[i];
    drawCoverImage(sctx, img, x, y, w, h);
    sctx.strokeStyle = 'rgba(0,0,0,0.08)';
    sctx.lineWidth = 1;
    sctx.strokeRect(x, y, w, h);
  });

  if (currentMode === 'polaroid' || currentMode === 'double-polaroid') {
    const BB = 90, BT = 20;
    sctx.fillStyle = 'rgba(0,0,0,0.35)';
    sctx.font = '500 26px DM Sans, sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText('SnapBooth', sw / 2, H + BT + BB * 0.38);
    sctx.font = '18px DM Sans, sans-serif';
    sctx.fillStyle = 'rgba(0,0,0,0.2)';
    sctx.fillText(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), sw / 2, H + BT + BB * 0.62);
    sctx.textAlign = 'start';
  }
  if (currentMode === 'photocard') {
    const BT = 30, BB = 100;
    sctx.fillStyle = 'rgba(0,0,0,0.4)';
    sctx.font = '500 30px DM Sans, sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText('SnapBooth', sw / 2, H + BT + BB * 0.36);
    sctx.font = '20px DM Sans, sans-serif';
    sctx.fillStyle = 'rgba(0,0,0,0.25)';
    sctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), sw / 2, H + BT + BB * 0.62);
    sctx.textAlign = 'start';
  }

  const stripModes = ['4cut', '3cut', '2cut'];
  const multiModes  = ['6cut', '3horiz', 'squaregrid'];

  if (stripModes.includes(currentMode)) {
    // Polaroid-style footer: generous 220px bottom margin, text sits in lower half
    const BOT = 220;
    const footerTop = sh - BOT;
    sctx.textAlign = 'center';
    sctx.fillStyle = 'rgba(0,0,0,0.5)';
    sctx.font = '500 36px "DM Serif Display", serif';
    sctx.fillText('SnapBooth', sw / 2, footerTop + BOT * 0.55);
    sctx.font = '400 22px "DM Sans", sans-serif';
    sctx.fillStyle = 'rgba(0,0,0,0.3)';
    sctx.fillText(
      new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      sw / 2, footerTop + BOT * 0.78
    );
    sctx.textAlign = 'start';
  }

  if (multiModes.includes(currentMode)) {
    sctx.fillStyle = 'rgba(0,0,0,0.2)';
    sctx.font = '500 16px DM Sans, sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText('snapbooth.app', sw / 2, sh - 10);
    sctx.textAlign = 'start';
  }

  stripCanvas.style.display = 'block';
  gifResult.classList.add('hidden');
}

// ── Upload existing photos ──
function normalizeUploaded(srcImg) {
  // Letterbox/crop to a stable 1280x960 (4:3) so all uploaded shots share dims
  const W = 1280, H = 960;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  const sr = srcImg.width / srcImg.height;
  const tr = W / H;
  let sx, sy, sw, sh;
  if (sr > tr) { sh = srcImg.height; sw = sh * tr; sx = (srcImg.width - sw) / 2; sy = 0; }
  else         { sw = srcImg.width;  sh = sw / tr; sx = 0; sy = (srcImg.height - sh) / 2; }
  cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
  cx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, W, H);
  return new Promise(res => {
    const out = new Image();
    out.onload = () => res(out);
    out.src = c.toDataURL('image/jpeg', 0.92);
  });
}

// Map an upload count to the layout mode that fits it exactly, so a single
// uploaded photo doesn't get cloned across every slot of a 4-cut strip.
const COUNT_TO_MODE = { 1: 'single', 2: '2cut', 3: '3horiz', 4: '4cut', 6: '6cut' };

function loadImageFile(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function sliceImageVertically(img, count) {
  const segH = Math.floor(img.naturalHeight / count);
  return Promise.all(Array.from({ length: count }, (_, i) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = segH;
    c.getContext('2d').drawImage(img, 0, -i * segH);
    return new Promise(res => {
      const out = new Image();
      out.onload = () => res(out);
      out.src = c.toDataURL('image/jpeg', 0.92);
    });
  }));
}

async function uploadPhotos(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  showToast('Loading photos…');

  // Single uploaded image that is itself a tall strip → slice it into segments
  // matching its aspect ratio, instead of cropping a 4:3 chunk from the middle.
  if (files.length === 1) {
    const img = await loadImageFile(files[0]);
    const aspect = img.naturalHeight / img.naturalWidth;
    let stripCount = 0;
    if (aspect >= 3.2)      stripCount = 4;
    else if (aspect >= 2.4) stripCount = 3;
    else if (aspect >= 1.6) stripCount = 2;

    if (stripCount) {
      const stripMode = { 4: '4cut', 3: '3horiz', 2: '2cut' }[stripCount];
      setMode(stripMode);
      shots = await sliceImageVertically(img, stripCount);
      stickers = []; currentGifBlob = null;
      updateShotDots();
      buildStrip();
      openPreview();
      showToast('Photos loaded customize away!');
      const inp = document.getElementById('upload-input');
      if (inp) inp.value = '';
      return;
    }
  }

  const fitMode = COUNT_TO_MODE[files.length];
  if (fitMode && fitMode !== currentMode) setMode(fitMode);

  const max = maxShots();
  const picked = files.slice(0, max);

  shots = []; stickers = []; currentGifBlob = null;

  for (const file of picked) {
    const raw = await loadImageFile(file);
    const norm = await normalizeUploaded(raw);
    shots.push(norm);
    if (shots.length >= max) break;
  }

  updateShotDots();
  buildStrip();
  openPreview();
  showToast('Photos loaded customize away!');
  // Reset the input so the same file can be selected again
  const inp = document.getElementById('upload-input');
  if (inp) inp.value = '';
}

// ── Preview overlay ──
function openPreview() {
  document.getElementById('preview-overlay').classList.add('open');
  const header = document.querySelector('header');
  if (header) header.style.display = 'none';
}
function closePreview() {
  document.getElementById('preview-overlay').classList.remove('open');
  const header = document.querySelector('header');
  if (header) header.style.display = '';
}

// ── Customize ──
async function goCustomize() {
  if (currentMode === 'gif' && currentGifBlob) {
    showToast('GIF customization not supported yet');
    return;
  }
  if (!shots.length) return;
  // Convert shots to data URLs and stash for customize page
  const shotData = shots.map(img => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  });
  try {
    await saveShots(shotData);
    sessionStorage.setItem('sb_mode', currentMode);
    sessionStorage.setItem('sb_filter', currentFilter);
  } catch (e) {
    showToast('Could not save photos');
    return;
  }
  location.href = 'customize.html';
}

// ── Retake ──
function retake() {
  shots = []; stickers = []; currentGifBlob = null;
  updateShotDots();
  closePreview();
  gifResult.classList.add('hidden');
  gifResult.src = '';
  stripCanvas.style.display = 'block';
}

// ── Download ──
const DOWNLOAD_NAMES = {
  '4cut':'snapbooth-4cut-strip','2cut':'snapbooth-2cut-strip','6cut':'snapbooth-6cut-grid',
  '3horiz':'snapbooth-3cut-horizontal','squaregrid':'snapbooth-square-collage',
  'polaroid':'snapbooth-polaroid','photocard':'snapbooth-photo-card','single':'snapbooth',
};

function downloadStrip() {
  if (currentMode === 'gif' && currentGifBlob) {
    const a = document.createElement('a');
    a.download = 'snapbooth-' + Date.now() + '.gif';
    a.href = URL.createObjectURL(currentGifBlob);
    a.click();
    showToast('GIF downloaded!');
    return;
  }
  if (!shots.length) return;
  buildStrip();
  const a = document.createElement('a');
  a.download = (DOWNLOAD_NAMES[currentMode] || 'snapbooth') + '-' + Date.now() + '.png';
  a.href = stripCanvas.toDataURL('image/png');
  a.click();
  showToast('Downloaded!');
}

async function shareStrip() {
  if (currentMode === 'gif' && currentGifBlob) {
    try {
      const file = new File([currentGifBlob], 'snapbooth.gif', { type: 'image/gif' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My SnapBooth GIF!' });
        return;
      }
    } catch {}
    showToast('Right-click the GIF to save it!');
    return;
  }
  if (!shots.length) return;
  buildStrip();
  try {
    if (navigator.share && navigator.canShare) {
      stripCanvas.toBlob(async blob => {
        const file = new File([blob], 'snapbooth.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'My SnapBooth photo strip!' });
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
        .catch(() => showToast('Right-click the strip to save!'));
    } catch { showToast('Right-click the strip to save!'); }
  }, 'image/png');
}

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// ── Layout scroll arrows (only present in legacy horizontal layout) ──
const _lp = document.getElementById('layout-prev');
const _ln = document.getElementById('layout-next');
const _ls = document.getElementById('layout-scroll');
if (_lp && _ls) _lp.addEventListener('click', () => _ls.scrollBy({ left: -220, behavior: 'smooth' }));
if (_ln && _ls) _ln.addEventListener('click', () => _ls.scrollBy({ left: 220, behavior: 'smooth' }));

// ── Init ──
initCamera();
updateShotDots();

const urlMode = new URLSearchParams(location.search).get('mode');
if (urlMode && MODE_SHOTS[urlMode]) {
  setMode(urlMode);
} else {
  setMode(currentMode);
}
