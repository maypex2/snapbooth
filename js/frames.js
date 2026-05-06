// Each themed frame can declare `autoStickers`: positioned SVG stickers that
// get applied when the user picks that frame in customize.html. They are
// regular stickers afterwards fully draggable and resizable.
//
// Coordinates: x/y in [0, 1] as a fraction of the canvas (top-left origin),
// size as a fraction of canvas width.
const FRAMES = [
  { id: 'strip',      label: 'Strip',     bg: '#ffffff', preview: 'strip'   },
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
  } else if (frameId === 'white' || frameId === 'strip') {
    sctx.strokeStyle = 'rgba(0,0,0,0.06)';
    sctx.lineWidth = 1;
    sctx.strokeRect(0, 0, sw, sh);
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
    sctx.fillStyle = 'rgba(0,0,0,0.35)';
    sctx.fillText(stamp, sw - pad + 2, sh - pad + 2);
    sctx.fillStyle = '#FF8C2E';
    sctx.fillText(stamp, sw - pad, sh - pad);
    // REC dot, top-left
    sctx.textAlign = 'left';
    sctx.font = '700 ' + Math.round(sw * 0.028) + 'px "DM Sans", monospace';
    sctx.fillStyle = '#FF3B3B';
    sctx.beginPath();
    sctx.arc(pad + 6, pad + 8, Math.max(4, sw * 0.008), 0, Math.PI * 2);
    sctx.fill();
    sctx.fillText('REC', pad + 18, pad + 14);
    sctx.textAlign = 'start';
  }
}

// Frames that should flip the photos horizontally before drawing them
// (mirror trend). Returns true if active.
function frameMirrorsPhotos(frameId) {
  return frameId === 'mirrored';
}
