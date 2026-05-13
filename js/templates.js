// Pre-made photo templates. Each entry:
//   id, name, file, mode (matching layout count), aspect (w/h),
//   slots: [{x,y,w,h}] in normalized [0,1] coords of the template image,
//   whiteBox: true to draw a white rectangle behind each slot (for
//     decorative patterns that don't have a built-in photo cutout).
const TEMPLATES = [
  // 4-cut decorative patterns (no built-in boxes → overlay 4 white slots)
  {
    id: 'tpl-4cut-pink-swirl', name: 'Pink Swirl', file: 'assets/templates/4cut-strip.webp',
    mode: '4cut', aspect: 0.36, whiteBox: true,
    slots: [
      { x: 0.10, y: 0.05, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.28, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.51, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.74, w: 0.80, h: 0.21 },
    ],
  },
  {
    id: 'tpl-4cut-confetti', name: 'Confetti', file: 'assets/templates/4cut-strip-1.webp',
    mode: '4cut', aspect: 0.36, whiteBox: true,
    slots: [
      { x: 0.10, y: 0.05, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.28, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.51, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.74, w: 0.80, h: 0.21 },
    ],
  },
  {
    id: 'tpl-4cut-cats', name: 'Black Cats', file: 'assets/templates/4cut-strip2.webp',
    mode: '4cut', aspect: 0.36, whiteBox: true,
    slots: [
      { x: 0.13, y: 0.06, w: 0.74, h: 0.20 },
      { x: 0.13, y: 0.28, w: 0.74, h: 0.20 },
      { x: 0.13, y: 0.50, w: 0.74, h: 0.20 },
      { x: 0.13, y: 0.72, w: 0.74, h: 0.20 },
    ],
  },
  {
    id: 'tpl-4cut-pink-loops', name: 'Pink Loops', file: 'assets/templates/4cut-strip3.webp',
    mode: '4cut', aspect: 0.36, whiteBox: true,
    slots: [
      { x: 0.13, y: 0.06, w: 0.74, h: 0.20 },
      { x: 0.13, y: 0.28, w: 0.74, h: 0.20 },
      { x: 0.13, y: 0.50, w: 0.74, h: 0.20 },
      { x: 0.13, y: 0.72, w: 0.74, h: 0.20 },
    ],
  },
  {
    id: 'tpl-4cut-style4', name: 'Style 4', file: 'assets/templates/4cut-strip4.webp',
    mode: '4cut', aspect: 0.36, whiteBox: true,
    slots: [
      { x: 0.10, y: 0.05, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.28, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.51, w: 0.80, h: 0.21 },
      { x: 0.10, y: 0.74, w: 0.80, h: 0.21 },
    ],
  },
  {
    id: 'tpl-3cut-snap', name: 'Snap!', file: 'assets/templates/4cut-strip5.webp',
    mode: '3cut', aspect: 0.34, whiteBox: true,
    slots: [
      { x: 0.08, y: 0.11, w: 0.84, h: 0.23 },
      { x: 0.08, y: 0.37, w: 0.84, h: 0.23 },
      { x: 0.08, y: 0.63, w: 0.84, h: 0.23 },
    ],
  },
];

function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || null;
}

// Cache loaded template images
const _templateImgCache = {};
function loadTemplateImage(file) {
  if (_templateImgCache[file]) return Promise.resolve(_templateImgCache[file]);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { _templateImgCache[file] = img; res(img); };
    img.onerror = rej;
    // iOS Safari can taint canvases from direct same-origin image loads in
    // some cases. Fetching as a blob and using a blob: URL universally avoids
    // it. Falls back to direct load if fetch fails.
    fetch(file)
      .then(r => r.ok ? r.blob() : Promise.reject(r.status))
      .then(blob => { img.src = URL.createObjectURL(blob); })
      .catch(() => { img.src = file; });
  });
}
