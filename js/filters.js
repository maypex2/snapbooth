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

function applyFilterToCanvas(f) {
  if (f === 'none') return;
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
