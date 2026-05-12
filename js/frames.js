// Each themed frame can declare `autoStickers`: positioned SVG stickers that
// get applied when the user picks that frame in customize.html. They are
// regular stickers afterwards fully draggable and resizable.
//
// Coordinates: x/y in [0, 1] as a fraction of the canvas (top-left origin),
// size as a fraction of canvas width.
const FRAMES = [
  { id: 'white',      label: 'Classic',   bg: '#ffffff', preview: 'border'  },
  { id: 'minimal',    label: 'Minimal',   bg: '#f8f8f8', preview: 'minimal' },
  {
    id: 'heart', label: 'Heart', bg: '#fff0f5', preview: '♥',
    title: { text: 'with love',          color: '#c44b6a' },
    autoStickers: [
      { file: 'assets/stickers/heart-face.svg', x: 0.10, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/heart-face.svg', x: 0.90, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/heart-face.svg', x: 0.10, y: 0.95, size: 0.14 },
      { file: 'assets/stickers/heart-face.svg', x: 0.90, y: 0.95, size: 0.14 },
    ],
  },
  {
    id: 'valentine', label: 'Valentine', bg: '#ffe4ed', preview: '💝',
    title: { text: 'Be Mine',            color: '#b41843' },
    autoStickers: [
      { file: 'assets/stickers/heart-face.svg',     x: 0.12, y: 0.06, size: 0.20 },
      { file: 'assets/stickers/bow-ribbon.svg',     x: 0.88, y: 0.06, size: 0.18 },
      { file: 'assets/stickers/cherry-blossom.svg', x: 0.50, y: 0.04, size: 0.14 },
      { file: 'assets/stickers/heart-face.svg',     x: 0.92, y: 0.96, size: 0.14 },
    ],
  },
  {
    id: 'christmas', label: 'Holiday', bg: '#f0fff4', preview: '🎄',
    title: { text: 'Merry Christmas',    color: '#1f7a3d' },
    autoStickers: [
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.10, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.90, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/sparkle-doodle.svg', x: 0.50, y: 0.97, size: 0.16 },
    ],
  },
  {
    id: 'birthday', label: 'Birthday', bg: '#fffbf0', preview: '🎂',
    title: { text: 'Happy Birthday!',    color: '#c2700a' },
    autoStickers: [
      { file: 'assets/stickers/rainbow.svg',        x: 0.12, y: 0.06, size: 0.22 },
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.88, y: 0.06, size: 0.18 },
      { file: 'assets/stickers/sparkle-doodle.svg', x: 0.92, y: 0.96, size: 0.14 },
    ],
  },
  {
    id: 'graduation', label: 'Grad', bg: '#f0f4ff', preview: '🎓',
    title: { text: 'Class of ' + new Date().getFullYear(), color: '#2a3f9e' },
    autoStickers: [
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.10, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/sparkle-doodle.svg', x: 0.90, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.50, y: 0.97, size: 0.14 },
    ],
  },
  {
    id: 'newyear', label: 'New Year', bg: '#0e0e22', preview: '🎆',
    title: { text: 'Happy New Year ' + new Date().getFullYear(), color: '#ffd76a' },
    autoStickers: [
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.12, y: 0.06, size: 0.22 },
      { file: 'assets/stickers/sparkle-doodle.svg', x: 0.88, y: 0.06, size: 0.20 },
      { file: 'assets/stickers/star-sparkle.svg',   x: 0.50, y: 0.97, size: 0.16 },
    ],
  },
  // Korean Life4Cuts (인생네컷) — thick black border, white wordmark/date footer.
  // Decorations are drawn in drawFrameDecorations below.
  { id: 'life4cuts', label: 'Life4Cuts', bg: '#000000', preview: '인생' },
  // Photoism / Photomatic style — clean white border with bottom wordmark.
  { id: 'photoism',  label: 'Photoism',  bg: '#ffffff', preview: 'Pi' },
  // Mirrored frame — flips each photo horizontally for the symmetry trend.
  { id: 'mirrored',  label: 'Mirrored',  bg: '#f5f5f0', preview: '◐◑' },

  // Y2K Chrome — metallic silver gradient border, sparkle corners.
  {
    id: 'y2k', label: 'Y2K Chrome', bg: '#1a1a22', preview: '★',
    title: { text: 'Y2K ✦', color: '#dde2ee' },
    autoStickers: [
      { file: 'assets/stickers/star-sparkle.svg', x: 0.10, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/star-sparkle.svg', x: 0.90, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/sparkle-doodle.svg', x: 0.50, y: 0.97, size: 0.16 },
    ],
  },

  // Coquette — soft pink with bow corners and dashed lace border.
  {
    id: 'coquette', label: 'Coquette', bg: '#FFEEF2', preview: '🎀',
    title: { text: 'coquette', color: '#d44b6e' },
    autoStickers: [
      { file: 'assets/stickers/bow-ribbon.svg', x: 0.12, y: 0.06, size: 0.20 },
      { file: 'assets/stickers/bow-ribbon.svg', x: 0.88, y: 0.06, size: 0.20 },
      { file: 'assets/stickers/heart-face.svg', x: 0.50, y: 0.97, size: 0.14 },
    ],
  },

  // Retro Digicam — cream bg with burned-in orange date stamp.
  { id: 'digicam',  label: 'Retro Digicam', bg: '#F4EFE6', preview: '📷' },

  // Cyber / glitch — RGB-split borders + scan lines.
  {
    id: 'cyber', label: 'Cyber Glitch', bg: '#0a0a14', preview: '⚡',
    title: { text: 'GLITCH//', color: '#0ff' },
    autoStickers: [
      { file: 'assets/stickers/star-sparkle.svg', x: 0.10, y: 0.05, size: 0.16 },
      { file: 'assets/stickers/sparkle-doodle.svg', x: 0.90, y: 0.05, size: 0.16 },
    ],
  },

  // Noughties webcore — pixel hearts + MSN-era gradient border.
  {
    id: 'webcore', label: 'Webcore', bg: '#0E0428', preview: '💾',
    title: { text: 'webcore <3', color: '#79ffe1' },
    autoStickers: [
      { file: 'assets/stickers/heart-face.svg', x: 0.10, y: 0.05, size: 0.16 },
      { file: 'assets/stickers/star-sparkle.svg', x: 0.90, y: 0.05, size: 0.16 },
      { file: 'assets/stickers/heart-face.svg', x: 0.50, y: 0.97, size: 0.14 },
    ],
  },

  // Naver / Korean minimal — clean white border + Hangul date stamp.
  {
    id: 'naver', label: 'Naver Minimal', bg: '#ffffff', preview: '한',
  },

  // Sanrio-ish pastel — soft border, cloud + bow corners (generic, IP-safe).
  {
    id: 'sanrio', label: 'Pastel Soft', bg: '#FFF1F6', preview: '☁',
    title: { text: 'soft & sweet', color: '#E07AA0' },
    autoStickers: [
      { file: 'assets/stickers/bow-ribbon.svg', x: 0.10, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/bow-ribbon.svg', x: 0.90, y: 0.05, size: 0.18 },
      { file: 'assets/stickers/heart-face.svg', x: 0.50, y: 0.97, size: 0.14 },
    ],
  },
];

function getFrameBg(id) {
  return (FRAMES.find(f => f.id === id) || {}).bg || '#ffffff';
}

function getFrameAutoStickers(id) {
  return (FRAMES.find(f => f.id === id) || {}).autoStickers || [];
}

function getFrameTitle(id) {
  return (FRAMES.find(f => f.id === id) || {}).title || null;
}

function drawFrameTitle(sctx, frameId, sw, sh, topReserve) {
  const t = getFrameTitle(frameId);
  if (!t) return;
  const fontSize = Math.round(Math.max(26, Math.min(topReserve * 0.55, sw * 0.045)));
  sctx.fillStyle = t.color;
  sctx.font = `italic ${fontSize}px "DM Serif Display", serif`;
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText(t.text, sw / 2, topReserve / 2);
  sctx.textAlign = 'start';
  sctx.textBaseline = 'alphabetic';
}

function drawFrameDecorations(sctx, frameId, sw, sh) {
  if (frameId === 'minimal') {
    sctx.strokeStyle = 'rgba(0,0,0,0.15)';
    sctx.lineWidth = 3;
    sctx.strokeRect(6, 6, sw - 12, sh - 12);
  } else if (frameId === 'white') {
    sctx.strokeStyle = 'rgba(0,0,0,0.18)';
    sctx.lineWidth = 2;
    sctx.strokeRect(1, 1, sw - 2, sh - 2);
  } else if (frameId === 'life4cuts') {
    // Thick black border + white DATE / LOCATION footer wordmark.
    const borderW = Math.max(18, Math.round(sw * 0.025));
    sctx.strokeStyle = '#000';
    sctx.lineWidth = borderW;
    sctx.strokeRect(borderW / 2, borderW / 2, sw - borderW, sh - borderW);
    sctx.fillStyle = '#ffffff';
    sctx.textAlign = 'center';
    sctx.font = '600 ' + Math.round(sw * 0.035) + 'px "DM Sans", sans-serif';
    sctx.fillText('LIFE4CUTS', sw / 2, sh - borderW * 1.4);
    sctx.font = '500 ' + Math.round(sw * 0.022) + 'px "DM Sans", sans-serif';
    sctx.fillStyle = 'rgba(255,255,255,0.7)';
    const d = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
    sctx.fillText(d + '  ·  SEOUL', sw / 2, sh - borderW * 0.55);
    sctx.textAlign = 'start';
  } else if (frameId === 'photoism') {
    // Clean grey hairline + Photoism wordmark inside the bottom border.
    sctx.strokeStyle = 'rgba(0,0,0,0.08)';
    sctx.lineWidth = 1;
    sctx.strokeRect(0.5, 0.5, sw - 1, sh - 1);
    sctx.fillStyle = '#1a1a1a';
    sctx.textAlign = 'center';
    sctx.font = '600 ' + Math.round(sw * 0.038) + 'px "DM Serif Display", serif';
    sctx.fillText('Photoism', sw / 2, sh - sw * 0.025);
    sctx.fillStyle = 'rgba(0,0,0,0.45)';
    sctx.font = '400 ' + Math.round(sw * 0.018) + 'px "DM Sans", sans-serif';
    const d = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    sctx.fillText(d, sw / 2, sh - sw * 0.005 + 4);
    sctx.textAlign = 'start';
  } else if (frameId === 'mirrored') {
    sctx.strokeStyle = 'rgba(0,0,0,0.1)';
    sctx.lineWidth = 2;
    sctx.strokeRect(4, 4, sw - 8, sh - 8);
  } else if (frameId === 'y2k') {
    // Chrome metallic gradient border (Y2K vibe).
    const borderW = Math.max(16, Math.round(sw * 0.025));
    const g = sctx.createLinearGradient(0, 0, sw, sh);
    g.addColorStop(0,    '#dde2ee');
    g.addColorStop(0.25, '#9aa0b4');
    g.addColorStop(0.5,  '#f0f3fa');
    g.addColorStop(0.75, '#8a90a8');
    g.addColorStop(1,    '#cfd5e2');
    sctx.strokeStyle = g;
    sctx.lineWidth = borderW;
    sctx.strokeRect(borderW / 2, borderW / 2, sw - borderW, sh - borderW);
    // Inner thin chrome line for that double-bevel sheen.
    sctx.strokeStyle = 'rgba(255,255,255,0.6)';
    sctx.lineWidth = 1;
    sctx.strokeRect(borderW + 2, borderW + 2, sw - (borderW + 2) * 2, sh - (borderW + 2) * 2);
  } else if (frameId === 'coquette') {
    // Soft pink dashed-lace border with subtle inner ribbon.
    sctx.strokeStyle = '#E89BA8';
    sctx.lineWidth = 4;
    sctx.setLineDash([10, 7]);
    sctx.strokeRect(10, 10, sw - 20, sh - 20);
    sctx.setLineDash([]);
    sctx.strokeStyle = 'rgba(232,155,168,0.4)';
    sctx.lineWidth = 1;
    sctx.strokeRect(20, 20, sw - 40, sh - 40);
  } else if (frameId === 'digicam') {
    // Burned-in orange date stamp + REC indicator (Sony Mavica vibe).
    const pad = Math.max(20, Math.round(sw * 0.035));
    const d = new Date();
    const stamp =
      "'" + String(d.getFullYear()).slice(-2) + ' ' +
      String(d.getMonth() + 1).padStart(2, '0') + ' ' +
      String(d.getDate()).padStart(2, '0');
    const stampSize = Math.round(sw * 0.055);
    sctx.font = '700 ' + stampSize + 'px "DM Sans", monospace';
    sctx.textAlign = 'right';
    // Sit above the reserved brand-footer band so the stamp stays visible
    // (and so the orange numbers don't clash with the snapbooth wordmark).
    const bottomY = (typeof window !== 'undefined' && window.__frameBottomY) || sh;
    sctx.fillStyle = 'rgba(0,0,0,0.35)';
    sctx.fillText(stamp, sw - pad + 2, bottomY - pad + 2);
    sctx.fillStyle = '#FF8C2E';
    sctx.fillText(stamp, sw - pad, bottomY - pad);
    // REC dot, top-left
    sctx.textAlign = 'left';
    sctx.font = '700 ' + Math.round(sw * 0.028) + 'px "DM Sans", monospace';
    sctx.fillStyle = '#FF3B3B';
    sctx.beginPath();
    sctx.arc(pad + 6, pad + 8, Math.max(4, sw * 0.008), 0, Math.PI * 2);
    sctx.fill();
    sctx.fillText('REC', pad + 18, pad + 14);
    sctx.textAlign = 'start';
  } else if (frameId === 'cyber') {
    // RGB-split outer border (red + cyan offsets) + horizontal scan lines.
    const borderW = Math.max(10, Math.round(sw * 0.014));
    const inset = borderW;
    sctx.lineWidth = borderW;
    // red, offset up-left
    sctx.strokeStyle = '#ff2a6d';
    sctx.strokeRect(inset / 2 - 3, inset / 2 - 3, sw - inset, sh - inset);
    // cyan, offset down-right
    sctx.strokeStyle = '#0ff';
    sctx.strokeRect(inset / 2 + 3, inset / 2 + 3, sw - inset, sh - inset);
    // white inner hairline to anchor it
    sctx.strokeStyle = 'rgba(255,255,255,0.85)';
    sctx.lineWidth = 1;
    sctx.strokeRect(inset / 2, inset / 2, sw - inset, sh - inset);
    // scan lines on the whole canvas
    sctx.save();
    sctx.globalAlpha = 0.10;
    sctx.fillStyle = '#fff';
    for (let y = 0; y < sh; y += 4) sctx.fillRect(0, y, sw, 1);
    sctx.restore();
    // corner brackets
    sctx.strokeStyle = '#0ff';
    sctx.lineWidth = 2;
    const cb = Math.max(18, sw * 0.025);
    [[inset, inset, 1, 1], [sw - inset, inset, -1, 1], [inset, sh - inset, 1, -1], [sw - inset, sh - inset, -1, -1]]
      .forEach(([x, y, dx, dy]) => {
        sctx.beginPath();
        sctx.moveTo(x, y + cb * dy);
        sctx.lineTo(x, y);
        sctx.lineTo(x + cb * dx, y);
        sctx.stroke();
      });
  } else if (frameId === 'webcore') {
    // MSN-era diagonal gradient border + 8-bit pixel hearts in corners.
    const borderW = Math.max(14, Math.round(sw * 0.022));
    const g = sctx.createLinearGradient(0, 0, sw, sh);
    g.addColorStop(0,    '#9b5cff');
    g.addColorStop(0.33, '#ff6ad5');
    g.addColorStop(0.66, '#79ffe1');
    g.addColorStop(1,    '#ffd166');
    sctx.strokeStyle = g;
    sctx.lineWidth = borderW;
    sctx.strokeRect(borderW / 2, borderW / 2, sw - borderW, sh - borderW);
    // pixel heart drawer (5x4 pixel grid)
    function pixelHeart(cx, cy, px, color) {
      const heart = [
        [0,1,0,1,0],
        [1,1,1,1,1],
        [0,1,1,1,0],
        [0,0,1,0,0],
      ];
      sctx.fillStyle = color;
      const w = heart[0].length, h = heart.length;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (heart[r][c]) sctx.fillRect(cx + (c - w / 2) * px, cy + (r - h / 2) * px, px, px);
      }
    }
    const px = Math.max(4, Math.round(sw * 0.008));
    pixelHeart(borderW * 2 + px * 3, borderW * 2 + px * 2, px, '#ff6ad5');
    pixelHeart(sw - borderW * 2 - px * 3, borderW * 2 + px * 2, px, '#79ffe1');
    // bottom wordmark
    sctx.fillStyle = '#79ffe1';
    sctx.textAlign = 'center';
    sctx.font = '700 ' + Math.round(sw * 0.030) + 'px monospace';
    sctx.fillText('★ WEBCORE.EXE ★', sw / 2, sh - borderW * 0.7);
    sctx.textAlign = 'start';
  } else if (frameId === 'naver') {
    // Minimal white border + Hangul date stamp inside the bottom border.
    const borderW = Math.max(8, Math.round(sw * 0.012));
    sctx.strokeStyle = 'rgba(0,0,0,0.20)';
    sctx.lineWidth = borderW;
    sctx.strokeRect(borderW / 2, borderW / 2, sw - borderW, sh - borderW);
    // Inner hairline for the Naver-clean look
    sctx.strokeStyle = 'rgba(0,0,0,0.05)';
    sctx.lineWidth = 1;
    sctx.strokeRect(borderW + 4, borderW + 4, sw - (borderW + 4) * 2, sh - (borderW + 4) * 2);
    // Date stamp in Hangul
    const d = new Date();
    const stamp = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
    sctx.textAlign = 'center';
    sctx.fillStyle = '#1d8049'; // Naver-green accent
    sctx.font = '600 ' + Math.round(sw * 0.022) + 'px "DM Sans", sans-serif';
    sctx.fillText('SEOUL · 서울', sw / 2, sh - borderW * 1.6);
    sctx.fillStyle = 'rgba(0,0,0,0.55)';
    sctx.font = '400 ' + Math.round(sw * 0.020) + 'px "DM Sans", sans-serif';
    sctx.fillText(stamp, sw / 2, sh - borderW * 0.55);
    sctx.textAlign = 'start';
  } else if (frameId === 'sanrio') {
    // Soft pastel rounded border with cloud bumps + tiny hearts in corners.
    const borderW = Math.max(12, Math.round(sw * 0.018));
    const r = Math.round(sw * 0.045);
    sctx.strokeStyle = '#F7B6D0';
    sctx.lineWidth = borderW;
    sctx.beginPath();
    if (sctx.roundRect) {
      sctx.roundRect(borderW / 2, borderW / 2, sw - borderW, sh - borderW, r);
    } else {
      sctx.rect(borderW / 2, borderW / 2, sw - borderW, sh - borderW);
    }
    sctx.stroke();
    // Inner soft white halo
    sctx.strokeStyle = 'rgba(255,255,255,0.85)';
    sctx.lineWidth = 2;
    sctx.beginPath();
    if (sctx.roundRect) sctx.roundRect(borderW + 2, borderW + 2, sw - (borderW + 2) * 2, sh - (borderW + 2) * 2, r - 4);
    else sctx.rect(borderW + 2, borderW + 2, sw - (borderW + 2) * 2, sh - (borderW + 2) * 2);
    sctx.stroke();
    // Cloud bumps along the top edge
    sctx.fillStyle = '#FFFFFF';
    const cloudR = Math.max(10, sw * 0.022);
    const yC = borderW + 2;
    for (let i = 1; i <= 5; i++) {
      const xC = (sw / 6) * i;
      sctx.beginPath();
      sctx.arc(xC - cloudR * 0.7, yC, cloudR * 0.7, 0, Math.PI * 2);
      sctx.arc(xC,                yC, cloudR,       0, Math.PI * 2);
      sctx.arc(xC + cloudR * 0.7, yC, cloudR * 0.7, 0, Math.PI * 2);
      sctx.fill();
    }
    // Tiny corner hearts
    function tinyHeart(cx, cy, s, color) {
      sctx.fillStyle = color;
      sctx.beginPath();
      sctx.moveTo(cx, cy + s * 0.6);
      sctx.bezierCurveTo(cx - s, cy - s * 0.2, cx - s * 0.4, cy - s, cx, cy - s * 0.3);
      sctx.bezierCurveTo(cx + s * 0.4, cy - s, cx + s, cy - s * 0.2, cx, cy + s * 0.6);
      sctx.fill();
    }
    const hs = Math.max(8, sw * 0.014);
    tinyHeart(borderW * 2,       sh - borderW * 2, hs, '#E07AA0');
    tinyHeart(sw - borderW * 2,  sh - borderW * 2, hs, '#E07AA0');
  }
}

// Frames that should flip the photos horizontally before drawing them
// (mirror trend). Returns true if active.
function frameMirrorsPhotos(frameId) {
  return frameId === 'mirrored';
}

// Frames that paint their own designed footer at the bottom of the canvas
// (wordmark + date built into the frame's identity). When true, the caller
// should skip the generic snapbooth brand footer AND skip clipping the frame
// art above the footer band, so the frame's own footer renders intact.
function frameHasOwnFooter(frameId) {
  return frameId === 'life4cuts'
      || frameId === 'photoism'
      || frameId === 'naver'
      || frameId === 'webcore';
}
