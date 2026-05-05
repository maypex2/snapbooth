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
  }
}
