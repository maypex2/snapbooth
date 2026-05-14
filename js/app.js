// ── State ──
let currentFilter  = 'none';
let currentFrame   = 'white';
let currentMode    = '4cut';
var currentTimer   = 3;
let shots          = [];
let stickers       = [];
let isRunning      = false;
let stream         = null;
let currentGifBlob = null;
let cameraReady    = false;
let mirrorCamera   = true;

function toggleMirror(btn) {
  mirrorCamera = !mirrorCamera;
  document.body.classList.toggle('no-mirror', !mirrorCamera);
  if (btn) {
    btn.classList.toggle('active', mirrorCamera);
    btn.setAttribute('aria-pressed', String(mirrorCamera));
  }
}

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

// Tracks which camera is active. Persisted so returning users skip the flip.
let currentFacing = (() => {
  try { return localStorage.getItem('sb_facing') || 'user'; } catch { return 'user'; }
})();

async function enableCamera(facing) {
  if (facing) currentFacing = facing;
  // If we're switching facing on an already-live stream, tear it down first.
  if (cameraReady && facing && stream) {
    try { stream.getTracks().forEach(t => t.stop()); } catch {}
    cameraReady = false;
    stream = null;
  }
  if (cameraReady) return true;
  showCameraState('loading');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraState('error');
    return false;
  }

  // Try tiers from highest → lowest. Android Chrome silently picks a low
  // track if you only specify `ideal`, so we try `min` first to force HD,
  // then progressively relax if the device can't satisfy. Back cameras on
  // modern phones support 4K — try that first when facing="environment" so
  // photo quality matches the phone's native camera app.
  const isBack = currentFacing === 'environment';
  // Front cam: prioritize 720p first — runs at full 30fps smoothly on mid-range
  // phones (Samsung A52s, etc.). Forcing 1080p on a budget Android picks a
  // slow track that runs at 15fps and lags the countdown + filter overlay.
  // Selfies don't need 1080p; the strip output is downscaled anyway.
  // Back cam: stay aggressive — 4K → 1080p → 720p (back sensors are stronger).
  const tiers = isBack ? [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ] : [
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
    { video: { facingMode: 'user' }, audio: false },
    { video: true, audio: false },
  ];

  // Wrap each getUserMedia call in a timeout so Opera / privacy-blocking
  // browsers that never resolve the promise don't leave us stuck on the
  // "Starting camera…" overlay forever.
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('gum-timeout')), ms);
      promise.then(v => { clearTimeout(t); resolve(v); },
                   e => { clearTimeout(t); reject(e); });
    });
  }

  for (const constraints of tiers) {
    try {
      stream = await withTimeout(navigator.mediaDevices.getUserMedia(constraints), 12000);
      break;
    } catch (e) {
      stream = null;
      // NotAllowedError = user denied; no point retrying lower tiers.
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
    }
  }

  if (!stream) {
    showCameraState('error');
    return false;
  }

  try {
    video.srcObject = stream;
    // Don't block on play() — some browsers (Opera, mobile Safari with
    // autoplay restrictions) leave this promise pending. We only need the
    // stream attached; loadedmetadata + autoplay handle the rest.
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
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

// ── Flip camera (mobile / fullscreen) ──
// Front cam previews are mirrored (selfie convention); back cam must NOT be
// mirrored because the user is shooting the world, not themselves.
function applyFacingMirror() {
  const isBack = currentFacing === 'environment';
  mirrorCamera = !isBack;
  document.body.classList.toggle('no-mirror', isBack);
}
applyFacingMirror();

async function flipCamera() {
  if (isRunning) {
    showToast('Wait for the capture to finish before switching cameras');
    return;
  }
  const btn = document.getElementById('flip-cam-btn');
  if (btn) { btn.classList.remove('flipping'); void btn.offsetWidth; btn.classList.add('flipping'); }
  const next = currentFacing === 'user' ? 'environment' : 'user';
  const ok = await enableCamera(next);
  if (!ok) {
    // Restore prior facing if the requested camera isn't available
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    showToast("Couldn't switch camera");
    await enableCamera(currentFacing);
    return;
  }
  applyFacingMirror();
  try { localStorage.setItem('sb_facing', currentFacing); } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  const flipBtn = document.getElementById('flip-cam-btn');
  if (flipBtn) flipBtn.addEventListener('click', flipCamera);
});

// ── Release the camera when the user leaves the page / locks the phone ──
// Without this the MediaStream stays live, the camera LED stays on, and the
// phone keeps the camera pipeline running even after navigating away — that's
// what causes the device to heat up and lag for minutes after closing the tab.
function stopCameraStream() {
  if (!stream) return;
  try { stream.getTracks().forEach(t => t.stop()); } catch {}
  stream = null;
  cameraReady = false;
  if (video) {
    try { video.pause(); video.srcObject = null; } catch {}
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopCameraStream();
  } else if (currentFacing) {
    // Re-acquire when the user comes back — only if permission was previously granted
    enableCamera().catch(() => {});
  }
});
window.addEventListener('pagehide', stopCameraStream);
window.addEventListener('beforeunload', stopCameraStream);

// ── Modes ──
const MODE_SHOTS = {
  '4cut': 4, '3cut': 3, '2cut': 2, '6cut': 6, '3horiz': 3,
  'squaregrid': 4, '1large3small': 4, 'grid4': 4, 'single': 1, 'polaroid': 1,
  'double-polaroid': 2, 'photocard': 1, 'gif': 1, 'tilt3': 3, '4plus1': 5,
  '9cut': 9, 'vertical4': 4, 'diptych': 2,
};

function maxShots() { return MODE_SHOTS[currentMode] || 1; }

function setMode(m) {
  // Block layout swaps mid-capture — switching `currentMode` while a session
  // is in flight changes `maxShots()` and the strip geometry, leaving the
  // session half-applied to the new layout with the wrong slot count.
  if (isRunning) {
    showToast('Wait for the capture to finish before switching layouts');
    return;
  }
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
  // Intensify the white-screen flash when the flash toggle is ON. Front cams
  // have no hardware torch, so the bright white preview overlay doubles as a
  // "selfie flash" — meaningfully brightens the subject in low light.
  const on = typeof window.__sbFlashOn === 'function' && window.__sbFlashOn();
  if (on) f.classList.add('flash-strong');
  f.classList.add('pop');
  setTimeout(() => {
    f.classList.remove('pop');
    f.classList.remove('flash-strong');
  }, on ? 220 : 120);
}

// Match what the user actually sees in the live preview. The <video> element
// uses object-fit: cover inside #cam-wrap, so the visible frame is a center
// crop of the raw camera frame at the cam-wrap's aspect ratio. Capturing the
// raw video frame instead would include hidden area above/below — which is
// why "head + shoulders" previews end up showing only the head in the strip.
function getCaptureCrop() {
  const wrap = document.getElementById('cam-wrap');
  const vw = video.videoWidth || canvas.width;
  const vh = video.videoHeight || canvas.height;
  const wrapW = wrap.clientWidth || vw;
  const wrapH = wrap.clientHeight || vh;
  const wrapAspect = wrapW / wrapH;
  const vAspect = vw / vh;

  let sx, sy, sw, sh;
  if (vAspect > wrapAspect) {
    sh = vh;
    sw = Math.round(vh * wrapAspect);
    sx = Math.round((vw - sw) / 2);
    sy = 0;
  } else {
    sw = vw;
    sh = Math.round(vw / wrapAspect);
    sx = 0;
    sy = Math.round((vh - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

function captureFrame() {
  return new Promise(resolve => {
    const { sx, sy, sw, sh } = getCaptureCrop();

    // ── Cap output dimensions at MAX_CAPTURE_EDGE px ──
    // Back-cam at 4K (3840×2160) gave the worst experience: each captureFrame
    // was running a synchronous toDataURL on a 4K canvas which took 1–2s
    // and froze the main thread between countdowns (the "2-second pause
    // after 1" your friend saw). Capping the long edge at 1920px:
    //   - Cuts encode time ~4× (15MP → 4MP)
    //   - Output still looks great in strips (downscaled further anyway)
    //   - Front-cam already at 720p is unaffected — no upscale
    //   - Works identically on iOS Safari (toBlob is supported since iOS 13).
    const MAX_CAPTURE_EDGE = 1920;
    let dw = sw, dh = sh;
    const longest = Math.max(sw, sh);
    if (longest > MAX_CAPTURE_EDGE) {
      const k = MAX_CAPTURE_EDGE / longest;
      dw = Math.round(sw * k);
      dh = Math.round(sh * k);
    }
    canvas.width  = dw;
    canvas.height = dh;
    ctx.save();
    if (mirrorCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    if (ctxFilterSupported() && currentFilter && currentFilter !== 'none') {
      ctx.filter = FILTER_CSS[currentFilter] || 'none';
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
    applyFilterToCanvas(currentFilter);

    // ── Async toBlob instead of sync toDataURL ──
    // toDataURL is base64-encoding the entire canvas on the main thread —
    // visible UI freeze on big captures. toBlob runs the JPEG encode on a
    // background thread, so the next countdown can start immediately. The
    // resulting blob URL is cheaper to decode than a data URL on iOS too.
    const handleSrc = (src) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img); // never hang the session
      img.src = src;
    };
    if (canvas.toBlob) {
      canvas.toBlob(blob => {
        if (blob) handleSrc(URL.createObjectURL(blob));
        else handleSrc(canvas.toDataURL('image/jpeg', 0.92));
      }, 'image/jpeg', 0.9);
    } else {
      handleSrc(canvas.toDataURL('image/jpeg', 0.92));
    }
  });
}

// Wait for the user to click the capture button (used in Manual timer mode).
function waitForSnap() {
  return new Promise(resolve => {
    const btn = document.getElementById('snap-btn');
    btn.disabled = false;
    const originalLabel = btn.dataset.label || btn.textContent;
    btn.dataset.label = originalLabel;
    btn.textContent = 'Capture';
    const handler = () => {
      btn.removeEventListener('click', handler);
      btn.disabled = true;
      btn.textContent = originalLabel;
      resolve();
    };
    btn.addEventListener('click', handler);
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
    if (currentTimer > 0) {
      await countdown(currentTimer);
    } else {
      showToast(`Tap Capture for shot ${i + 1} of ${max}`);
      await waitForSnap();
    }
    flashEffect();
    const img = await captureFrame();
    if (shots.length >= max) break;
    shots.push(img);
    updateShotDots();
    ejectPolaroid(img);
    if (i < max - 1 && currentTimer > 0) await sleep(600);
  }

  document.getElementById('rec-ring').classList.remove('active');
  document.getElementById('snap-btn').disabled = false;
  isRunning = false;
  document.body.classList.remove('session-running');
  shots = shots.slice(0, max);
  buildStrip();
  openPreview(true);
  showToast('Photo strip ready!');
}

async function startGifSession() {
  // isRunning + button-disabled were set in startSession()
  document.getElementById('rec-ring').classList.add('active');

  if (currentTimer > 0) {
    await countdown(currentTimer);
  } else {
    showToast('Tap Capture to start recording');
    await waitForSnap();
  }

  const gifCrop      = getCaptureCrop();
  canvas.width       = gifCrop.sw;
  canvas.height      = gifCrop.sh;
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
    if (mirrorCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    if (ctxFilterSupported() && currentFilter && currentFilter !== 'none') {
      ctx.filter = FILTER_CSS[currentFilter] || 'none';
    }
    ctx.drawImage(video, gifCrop.sx, gifCrop.sy, gifCrop.sw, gifCrop.sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.filter = 'none';
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

  // Worker MUST be same-origin — modern browsers block cross-origin Web
  // Workers, which silently breaks gif.js and stalls the encode at 0%.
  const gif = new GIF({
    workers: 2, quality: 10, width: w, height: h,
    workerScript: 'js/gif.worker.js',
  });

  boomerangFrames.forEach(fc => gif.addFrame(fc, { delay: Math.round(1000 / 12) }));

  gif.on('progress', p => {
    bar.style.width   = (p * 100).toFixed(0) + '%';
    label.textContent = 'Encoding GIF… ' + Math.round(p * 100) + '%';
  });

  gif.on('finished', blob => {
    progressWrap.style.display = 'none';
    isRunning      = false;
    document.body.classList.remove('session-running');
    currentGifBlob = blob;
    const url      = URL.createObjectURL(blob);
    gifResult.src  = url;
    gifResult.classList.remove('hidden');
    stripCanvas.style.display = 'none';
    document.getElementById('snap-btn').disabled = false;
    openPreview(true);
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
  // Visual signal: dim the layout carousel so users can see they can't
  // switch layouts mid-capture.
  document.body.classList.add('session-running');

  // (Live CSS filter is kept ON during the session — users want WYSIWYG.
  // The 720p front-cam tier + 30fps cap is what keeps things smooth now.)

  // First-tap behavior: if the camera isn't running yet, turn it on
  // and proceed immediately to the capture session.
  if (!cameraReady) {
    const ok = await enableCamera();
    if (!ok) {
      isRunning = false;
      document.body.classList.remove('session-running');
      document.getElementById('snap-btn').disabled = false;
      return;
    }
    const snapLabel = document.getElementById('snap-label');
    if (snapLabel) snapLabel.textContent = currentMode === 'gif' ? 'Record GIF' : 'Capture';
  }

  if (currentMode === 'gif') startGifSession();
  else startPhotoSession();
}

// Fill the slot completely (cover) — image is center-cropped.
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

// ── Unified brand footer ─────────────────────────────────────────
// Single source of truth for "BopBooth" wordmark + date placement
// across every layout, so brand presentation stays consistent.
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

function isDarkHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5;
}

function drawBrandFooter(sctx, sw, sh, reserveH) {
  const wmSize   = Math.max(20, Math.min(reserveH * 0.42, sw * 0.045));
  const dateSize = Math.max(12, wmSize * 0.5);
  const cx       = sw / 2;
  const footerTop = sh - reserveH;
  const wmY   = footerTop + reserveH * 0.55;
  const dateY = footerTop + reserveH * 0.82;
  // photocard forces a white card; everything else uses the frame bg.
  const dark = currentMode === 'photocard' ? false : isDarkHex(getFrameBg(currentFrame));
  const wmColor   = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';
  const dateColor = dark ? 'rgba(255,255,255,0.6)'  : 'rgba(0,0,0,0.35)';

  sctx.save();
  sctx.textAlign = 'center';
  sctx.textBaseline = 'alphabetic';
  sctx.fillStyle = wmColor;
  sctx.font = `italic ${Math.round(wmSize)}px "DM Serif Display", serif`;
  sctx.fillText('BopBooth', cx, wmY);
  sctx.fillStyle = dateColor;
  sctx.font = `400 ${Math.round(dateSize)}px "DM Sans", sans-serif`;
  sctx.fillText(
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    cx, dateY
  );
  sctx.restore();
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
      if (shots[i]) {
        sctx.fillStyle = '#ffffff';
        sctx.fillRect(-W / 2, -H / 2, W, H);
        drawCoverImage(sctx, shots[i], -W / 2, -H / 2, W, H);
      }
      sctx.restore();
    }
    sctx.fillStyle = '#FAF6EE';
    sctx.textAlign = 'center';
    sctx.font = Math.floor(BOT * 0.34) + 'px "DM Serif Display", serif';
    sctx.fillText('BopBooth', sw / 2, sh - BOT * 0.55);
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
  } else if (currentMode === '9cut') {
    const PAD = 24, GAP = 10, TOP = 80, BOT = 60;
    sw = W * 3 + GAP * 2 + PAD * 2;
    sh = H * 3 + GAP * 2 + TOP + BOT;
    positions = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++)
        positions.push({ x: PAD + col * (W + GAP), y: TOP + row * (H + GAP), w: W, h: H });
  } else if (currentMode === 'vertical4') {
    // Korean Puri-style: slim strip with 4 portrait-cropped slots.
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
    const PAD = 40, GAP = 16, TOP = 80, BOT = 100;
    const smallW = W;
    const smallH = Math.round(H * 0.7);
    const wideW = smallW * 2 + GAP;
    const wideH = Math.round(H * 0.95);
    sw = wideW + PAD * 2;
    sh = smallH * 2 + GAP + wideH + GAP + TOP + BOT;
    positions = [
      { x: PAD,                y: TOP,                        w: smallW, h: smallH },
      { x: PAD + smallW + GAP, y: TOP,                        w: smallW, h: smallH },
      { x: PAD,                y: TOP + smallH + GAP,         w: smallW, h: smallH },
      { x: PAD + smallW + GAP, y: TOP + smallH + GAP,         w: smallW, h: smallH },
      { x: PAD,                y: TOP + smallH * 2 + GAP * 2, w: wideW,  h: wideH  },
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

  shots.slice(0, maxShots()).forEach((img, i) => {
    if (!positions[i]) return;
    const { x, y, w, h } = positions[i];
    drawCoverImage(sctx, img, x, y, w, h);
    sctx.strokeStyle = 'rgba(0,0,0,0.32)';
    sctx.lineWidth = 2;
    sctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  });

  // Frame decorations render ABOVE photos so themed text (REC, date stamp,
  // wordmarks, borders) is never hidden by photo content. Clipped above the
  // brand-footer band so frame art can't overlap BopBooth + date.
  const footerReserve = footerReserveFor(currentMode);
  const ownFooter = typeof frameHasOwnFooter === 'function' && frameHasOwnFooter(currentFrame);
  if (currentMode !== 'photocard') {
    if (ownFooter) {
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

  // Unified brand footer — same italic centered "BopBooth" + date on every layout.
  // Skipped when the frame already paints its own designed footer.
  if (currentMode !== 'tilt3' && !ownFooter) drawBrandFooter(sctx, sw, sh, footerReserve);

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
// Pause / resume the live preview to free GPU+RAM. With the strip preview
// open, the user isn't looking at the camera — but the <video> element keeps
// decoding 30fps + running the CSS filter pass, plus 4-9 captured Image
// bitmaps + the big strip canvas all live simultaneously. On a budget phone
// (Samsung A52s in our testing) that combo crashes the tab to a black screen.
function suspendLivePreview() {
  try {
    if (video) {
      video.pause();
      video.style.setProperty('filter', 'none', 'important');
      video.style.setProperty('-webkit-filter', 'none', 'important');
    }
  } catch {}
}
function resumeLivePreview() {
  try {
    if (video && stream) {
      // Resume playback FIRST without any filter — applying a CSS filter to
      // a paused/just-resumed video element forces an extra composite pass
      // while the decode pipeline is still warming up, which is exactly what
      // makes the retake transition stutter on low-end phones.
      video.style.setProperty('filter', 'none', 'important');
      video.style.setProperty('-webkit-filter', 'none', 'important');
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      // Reapply the user's filter only AFTER the video is actually playing
      // and the close animation has had a chance to finish (rAF + ~120ms).
      // This keeps the retake transition smooth and pushes the filter
      // composite cost out of the critical user-perceived window.
      const css = (typeof FILTER_CSS !== 'undefined' && currentFilter && FILTER_CSS[currentFilter]) || 'none';
      if (css && css !== 'none') {
        const reapply = () => {
          video.style.setProperty('filter', css, 'important');
          video.style.setProperty('-webkit-filter', css, 'important');
        };
        // Wait for the next paint, then ~120ms more (covers the modal slide).
        requestAnimationFrame(() => setTimeout(reapply, 120));
      }
    }
  } catch {}
}

function openPreview(animate = false) {
  const header = document.querySelector('header');
  const overlay = document.getElementById('preview-overlay');
  suspendLivePreview();
  // Animated open (end of capture session): play the printer-slot
  // animation FIRST, then reveal the preview modal once it starts to
  // dismiss. The strip canvas already has the rendered content from
  // buildStrip(), so the printer overlay can grab it even while the
  // preview is still hidden.
  if (animate) {
    playPrinterAnim();
    // Wait long enough for the printer-slide animation to actually finish
    // before the preview modal slides up over it. Front-cam at 720p encodes
    // in <100ms (anim plays smoothly) but the modal was previously covering
    // it at 1800ms before it could finish. Back-cam at 4K takes ~300-500ms
    // to encode, so we need extra runway too. 2400ms covers both reliably.
    setTimeout(() => {
      overlay.classList.add('open');
      if (header) header.style.display = 'none';
    }, 2400);
    return;
  }
  overlay.classList.add('open');
  if (header) header.style.display = 'none';
}
function closePreview() {
  // Drop the modal first so the slide-out animation begins immediately on
  // the next frame — heavy work (camera resume, filter reapply, GC) happens
  // AFTER the visual transition completes, not blocking it.
  document.getElementById('preview-overlay').classList.remove('open');
  const header = document.querySelector('header');
  if (header) header.style.display = '';

  // Clean up any leftover printer-animation overlay + its blob URL so we
  // don't keep a multi-MB image hanging in GPU memory after retake.
  document.querySelectorAll('.printer-anim-overlay').forEach(node => {
    const img = node.querySelector('img');
    if (img && img.src && img.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(img.src); } catch {}
    }
    node.remove();
  });

  // Defer the camera resume until AFTER the close transition has had time
  // to render — keeps the slide-out smooth on low-end devices. Using rAF
  // chain rather than setTimeout(0) so we hit an actual paint boundary.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    resumeLivePreview();
  }));
}

// ── Customize ──
async function goCustomize() {
  if (currentMode === 'gif' && currentGifBlob) {
    showToast('GIF customization not supported yet');
    return;
  }
  if (!shots.length) return;
  // Release the camera before navigating — otherwise on low-RAM phones the
  // stream + filter pipeline stays live in the unloading tab and OOM-kills it
  // (black screen / browser crash). The visibilitychange/pagehide listeners
  // are a fallback; this is the deterministic path.
  try { stopCameraStream(); } catch {}
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
  '4cut':'BopBooth-4cut-strip','2cut':'BopBooth-2cut-strip','6cut':'BopBooth-6cut-grid',
  '3horiz':'BopBooth-3cut-horizontal','squaregrid':'BopBooth-square-collage',
  '9cut':'BopBooth-9cut-grid','vertical4':'BopBooth-puri-4cut','diptych':'BopBooth-diptych',
  'polaroid':'BopBooth-polaroid','photocard':'BopBooth-photo-card','single':'BopBooth',
};

// iOS Safari can't actually download via <a download> — clicks are silently
// dropped on data:/blob: URLs. Detect iOS so we can fall back to the share
// sheet, which lets the user pick "Save Image".
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Detect Android via multiple signals — some privacy-focused browsers
// (Opera, Brave, Samsung Internet) strip "Android" from the UA string.
// Fall back to userAgentData and a "touch + narrow viewport + not-iOS"
// heuristic so we still pick the right save flow / toast wording.
const IS_ANDROID =
  /Android/i.test(navigator.userAgent) ||
  (navigator.userAgentData && navigator.userAgentData.platform === 'Android') ||
  (!IS_IOS && navigator.maxTouchPoints > 0 && /Mobi|CrMo|FxiOS/i.test(navigator.userAgent));
const IS_MOBILE = IS_IOS || IS_ANDROID;

// Save a Blob to disk.
//   • iOS Safari blocks <a download> for blobs, so we MUST route through
//     Web Share — its sheet has a real "Save Image" entry.
//   • Android's share sheet only shows apps (Gmail/FB/etc.) with NO "Save
//     to Gallery" button, so Web Share is the wrong UX there. Direct
//     anchor download lands the file in the Downloads folder, which the
//     stock Photos/Gallery app indexes automatically.
//   • Desktop: anchor download.
async function saveBlob(blob, filename, mime) {
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
  // Anchor click survives iOS popup blocker if still in user-gesture stack.
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

// Spawn a small polaroid that pops out of the camera's bottom edge,
// hovers, then drifts down and fades. Pure visual feedback after each
// capture — runs in parallel with the rest of the session, doesn't block.
function ejectPolaroid(img) {
  const wrap = document.getElementById('cam-wrap');
  if (!wrap || !img || !img.src) return;
  const r = wrap.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'polaroid-eject';
  // Slight randomization so a burst of 4 shots doesn't look mechanical.
  const jitter = (Math.random() - 0.5) * 24;
  el.style.left = (r.left + r.width / 2 + jitter) + 'px';
  el.style.top  = (r.bottom - 4) + 'px';
  const thumb = document.createElement('img');
  thumb.src = img.src;
  el.appendChild(thumb);
  const cap = document.createElement('div');
  cap.className = 'pe-caption';
  cap.textContent = 'BopBooth';
  el.appendChild(cap);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1750);
}

// Fullscreen printer-slot animation: a stylized white slot at the top of
// screen, with the strip emerging downward out of it. Used to celebrate
// (a) end of a capture session, (b) IG exports, (c) customize-page
// downloads. NOT used on the in-modal preview download — that one stays
// silent so the modal stays in focus.
function playPrinterAnim(srcCanvas) {
  const src = srcCanvas || document.getElementById('strip-canvas');
  if (!src || !src.width || !src.height) return;

  // Drop any in-flight overlay so rapid re-clicks don't stack.
  document.querySelectorAll('.printer-anim-overlay').forEach(n => n.remove());

  const overlay = document.createElement('div');
  overlay.className = 'printer-anim-overlay';
  overlay.innerHTML =
    '<div class="printer-anim-slot"></div>' +
    '<div class="printer-anim-clip"><img class="printer-anim-strip" alt=""></div>';
  const img = overlay.querySelector('img');
  const slot = overlay.querySelector('.printer-anim-slot');

  // Encode the strip canvas to an image asynchronously. toDataURL on a big
  // strip canvas is synchronous and takes ~1–2s on mid-range phones, which
  // is what caused the ~2s frozen pause right after capture before the
  // printer animation could appear. toBlob runs off the main thread, so the
  // overlay can be inserted + animated immediately and the strip image just
  // pops in as soon as it's encoded.
  if (src.toBlob) {
    src.toBlob(blob => {
      if (blob && img) img.src = URL.createObjectURL(blob);
    }, 'image/png');
  } else {
    try { img.src = src.toDataURL('image/png'); } catch {}
  }
  // Once the image is laid out, size the slot to match the strip's
  // rendered width so the strip looks like it's emerging from a slot
  // that's the right size, not a tiny mouth (especially for wide layouts
  // like 3-horiz or 9-cut).
  // Default duration — overridden by syncAnimDuration once the rendered
  // height is known. Short strips need more time so the slide-out is visible.
  let animDur = 2200;
  function syncSlotWidth() {
    const w = img.getBoundingClientRect().width;
    if (w > 0 && slot) slot.style.width = Math.round(w + 20) + 'px';
  }
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
  document.body.appendChild(overlay);
  if (img.complete && img.src) requestAnimationFrame(() => { syncSlotWidth(); syncAnimDuration(); });
  requestAnimationFrame(() => overlay.classList.add('go'));

  // Auto-dismiss ~400ms after the (now dynamic) animation finishes.
  const cleanupBlob = () => {
    if (img && img.src && img.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(img.src); } catch {}
    }
  };
  const dismissAfter = () => {
    overlay.classList.remove('go');
    overlay.classList.add('gone');
    setTimeout(() => { cleanupBlob(); overlay.remove(); }, 400);
  };
  requestAnimationFrame(() => setTimeout(dismissAfter, animDur + 400));

  // Tap to skip — don't trap the user.
  overlay.addEventListener('click', () => {
    overlay.classList.add('gone');
    setTimeout(() => { cleanupBlob(); overlay.remove(); }, 250);
  });
}

function downloadStrip() {
  if (currentMode === 'gif' && currentGifBlob) {
    saveBlob(currentGifBlob, 'BopBooth-' + Date.now() + '.gif', 'image/gif');
    return;
  }
  if (!shots.length) return;
  buildStrip();
  const filename = (DOWNLOAD_NAMES[currentMode] || 'BopBooth') + '-' + Date.now() + '.png';

  // iOS needs synchronous canvas-to-blob conversion so navigator.share /
  // window.open run inside the click handler's user-activation window.
  if (IS_IOS) {
    let dataUrl;
    try { dataUrl = safeCanvasToDataURL(stripCanvas, 'image/png'); }
    catch (e) {
      console.error('[download] iOS toDataURL failed', e);
      showToast('Could not save image — try a smaller layout');
      return;
    }
    const blob = dataURLToBlob(dataUrl);
    const finalName = dataUrl.startsWith('data:image/jpeg')
      ? filename.replace(/\.png$/, '.jpg')
      : filename;
    const finalMime = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    saveBlob(blob, finalName, finalMime);
    return;
  }

  stripCanvas.toBlob(blob => {
    if (!blob) { showToast('Could not save image'); return; }
    saveBlob(blob, filename, 'image/png');
  }, 'image/png');
}

// Synchronous data-URL → Blob (mirrors customize.js — keeps the iOS user
// activation window valid for the share/save call that follows).
function dataURLToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Scales big canvases down to fit iOS Safari canvas limits (~16M pixels total,
// ~4096px on a single axis). Without this, toDataURL throws "Could not save
// image" for 4-cut / 9-cut / vertical4 strips on most iPhones.
function safeCanvasToDataURL(srcCanvas, mime) {
  const MAX_DIM = 3800, MAX_AREA = 14000000;
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const overDim  = Math.max(sw, sh) > MAX_DIM;
  const overArea = sw * sh > MAX_AREA;
  if (!overDim && !overArea) {
    try { return srcCanvas.toDataURL(mime || 'image/png'); } catch (e) {}
  }
  const dimScale  = overDim  ? MAX_DIM / Math.max(sw, sh) : 1;
  const areaScale = overArea ? Math.sqrt(MAX_AREA / (sw * sh)) : 1;
  const scale = Math.min(dimScale, areaScale, 1);
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));
  const tmp = document.createElement('canvas');
  tmp.width = tw; tmp.height = th;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(srcCanvas, 0, 0, tw, th);
  try { return tmp.toDataURL(mime || 'image/png'); }
  catch (e) { return tmp.toDataURL('image/jpeg', 0.92); }
}

async function shareStrip() {
  if (currentMode === 'gif' && currentGifBlob) {
    try {
      const file = new File([currentGifBlob], 'BopBooth.gif', { type: 'image/gif' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My BopBooth GIF!' });
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
        const file = new File([blob], 'BopBooth.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'My BopBooth photo strip!' });
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
