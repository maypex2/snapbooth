const FILTER_CSS = {
  none:    'none',
  bw:      'grayscale(100%) contrast(1.1)',
  vintage: 'sepia(60%) contrast(1.1) brightness(1.05) saturate(0.8)',
  retro:   'saturate(0.5) contrast(1.3) brightness(0.9)',
  glow:    'brightness(1.15) saturate(1.3)',
  warm:    'sepia(30%) saturate(1.4) brightness(1.08) contrast(1.05)',
  cool:    'hue-rotate(200deg) saturate(0.8) brightness(1.05)',
  noir:    'grayscale(100%) contrast(1.5) brightness(0.85)',
  fade:    'contrast(0.85) saturate(0.7) brightness(1.1)',
  sunset:  'sepia(40%) saturate(1.6) hue-rotate(-20deg) brightness(1.05)',
  dreamy:  'saturate(1.2) brightness(1.12) contrast(0.95)',
  drama:   'contrast(1.4) saturate(1.2) brightness(0.95)',
  pastel:  'saturate(0.65) brightness(1.15) contrast(0.9)',
  punch:   'saturate(1.6) contrast(1.2)',
};

function setFilter(f, btn) {
  currentFilter = f;
  video.style.filter = FILTER_CSS[f] || 'none';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Feature-detect ctx.filter once. iOS Safari 14.1+ supports it, but older
// iOS versions silently ignore it — we fall back to manual pixel work there.
let __ctxFilterSupported = null;
function ctxFilterSupported() {
  if (__ctxFilterSupported !== null) return __ctxFilterSupported;
  try {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 1;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 1);
    x.filter = 'grayscale(100%) brightness(0)';
    x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 1);
    const px = x.getImageData(0, 0, 1, 1).data;
    __ctxFilterSupported = px[0] < 20;
  } catch (e) { __ctxFilterSupported = false; }
  return __ctxFilterSupported;
}

// Manual pixel-level fallback for the common filters (iOS < 14.1 etc.)
function applyManualFilter(f) {
  if (!f || f === 'none') return;
  const css = FILTER_CSS[f] || '';
  let img;
  try { img = ctx.getImageData(0, 0, canvas.width, canvas.height); }
  catch (e) { return; }
  const d = img.data;

  const gray = /grayscale\((\d+)%?\)/.exec(css);
  const sepia = /sepia\((\d+)%?\)/.exec(css);
  const bright = /brightness\(([\d.]+)\)/.exec(css);
  const sat = /saturate\(([\d.]+)\)/.exec(css);
  const contrast = /contrast\(([\d.]+)\)/.exec(css);
  const hueRot = /hue-rotate\((-?\d+)deg\)/.exec(css);

  const gAmt  = gray ? Math.min(1, +gray[1] / 100) : 0;
  const sAmt  = sepia ? Math.min(1, +sepia[1] / 100) : 0;
  const bAmt  = bright ? +bright[1] : 1;
  const satAmt = sat ? +sat[1] : 1;
  const cAmt  = contrast ? +contrast[1] : 1;
  const hAmt  = hueRot ? +hueRot[1] : 0;
  const cosH = Math.cos(hAmt * Math.PI / 180);
  const sinH = Math.sin(hAmt * Math.PI / 180);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (gAmt > 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r + (lum - r) * gAmt;
      g = g + (lum - g) * gAmt;
      b = b + (lum - b) * gAmt;
    }
    if (sAmt > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (sr - r) * sAmt;
      g = g + (sg - g) * sAmt;
      b = b + (sb - b) * sAmt;
    }
    if (satAmt !== 1) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * satAmt;
      g = lum + (g - lum) * satAmt;
      b = lum + (b - lum) * satAmt;
    }
    if (hAmt !== 0) {
      const nr = r * (0.213 + cosH * 0.787 - sinH * 0.213) + g * (0.715 - cosH * 0.715 - sinH * 0.715) + b * (0.072 - cosH * 0.072 + sinH * 0.928);
      const ng = r * (0.213 - cosH * 0.213 + sinH * 0.143) + g * (0.715 + cosH * 0.285 + sinH * 0.140) + b * (0.072 - cosH * 0.072 - sinH * 0.283);
      const nb = r * (0.213 - cosH * 0.213 - sinH * 0.787) + g * (0.715 - cosH * 0.715 + sinH * 0.715) + b * (0.072 + cosH * 0.928 + sinH * 0.072);
      r = nr; g = ng; b = nb;
    }
    if (bAmt !== 1) { r *= bAmt; g *= bAmt; b *= bAmt; }
    if (cAmt !== 1) {
      r = (r - 128) * cAmt + 128;
      g = (g - 128) * cAmt + 128;
      b = (b - 128) * cAmt + 128;
    }
    d[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(img, 0, 0);
}

function applyFilterToCanvas(f) {
  if (f === 'none') return;
  if (!ctxFilterSupported()) applyManualFilter(f);
  if (f === 'retro') {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#000';
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillRect(0, y, canvas.width, 2);
    }
    ctx.restore();
  }
  if (f === 'vintage') {
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (f === 'glow') {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.filter = 'blur(8px) brightness(2)';
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
    ctx.filter = 'none';
  }
}
