const STICKERS = [
  { name: 'Bear',    file: 'assets/stickers/bear.svg' },
  { name: 'Bunny',   file: 'assets/stickers/bunny.svg' },
  { name: 'Cat',     file: 'assets/stickers/cat-bow.svg' },
  { name: 'Duck',    file: 'assets/stickers/duck.svg' },
  { name: 'Mochi',   file: 'assets/stickers/mochi.svg' },
  { name: 'Heart',   file: 'assets/stickers/heart-face.svg' },
  { name: 'Cloud',   file: 'assets/stickers/cloud-face.svg' },
  { name: 'Sparkle', file: 'assets/stickers/star-sparkle.svg' },
  { name: 'Rainbow', file: 'assets/stickers/rainbow.svg' },
  { name: 'Cherry',  file: 'assets/stickers/cherry-blossom.svg' },
  { name: 'Bow',     file: 'assets/stickers/bow-ribbon.svg' },
  { name: 'Boba',    file: 'assets/stickers/bubble-tea.svg' },
  { name: 'Cute',    file: 'assets/stickers/speech-cute.svg' },
  { name: 'Love',    file: 'assets/stickers/speech-love.svg' },
  { name: 'Yay',     file: 'assets/stickers/speech-yay.svg' },
  { name: 'Doodle',  file: 'assets/stickers/sparkle-doodle.svg' },
  { name: 'Washi',   file: 'assets/stickers/washi-pink.svg' },

  // Couple / Lover
  { name: 'Love Letter',   file: 'assets/stickers/love-letter.svg' },
  { name: 'Kiss',          file: 'assets/stickers/kiss-lips.svg' },
  { name: 'Heart Arrow',   file: 'assets/stickers/heart-arrow.svg' },
  { name: 'Couple Hearts', file: 'assets/stickers/couple-hearts.svg' },
  { name: 'Rose',          file: 'assets/stickers/rose.svg' },

  // Graduation
  { name: 'Grad Cap',      file: 'assets/stickers/grad-cap.svg' },
  { name: 'Diploma',       file: 'assets/stickers/diploma.svg' },
  { name: 'Award Ribbon',  file: 'assets/stickers/grad-ribbon.svg' },
  { name: 'Trophy',        file: 'assets/stickers/trophy.svg' },
  { name: 'Medal',         file: 'assets/stickers/medal.svg' },

  // Birthday
  { name: 'Birthday Cake', file: 'assets/stickers/cake.svg' },
  { name: 'Balloons',      file: 'assets/stickers/balloons.svg' },
  { name: 'Party Hat',     file: 'assets/stickers/party-hat.svg' },
  { name: 'Gift',          file: 'assets/stickers/gift.svg' },
  { name: 'Party Popper',  file: 'assets/stickers/party-popper.svg' },

  // Couple / Lover (2026-05 pack)
  { name: 'Rings',         file: 'assets/stickers/rings.svg' },
  { name: 'Forever',       file: 'assets/stickers/forever.svg' },
  { name: 'Love Key',      file: 'assets/stickers/love-key.svg' },
  { name: 'Love Bird',     file: 'assets/stickers/dove.svg' },
  { name: 'You & Me',      file: 'assets/stickers/you-and-me.svg' },

  // Coffee lover (2026-05 pack)
  { name: 'Coffee Cup',    file: 'assets/stickers/coffee-cup.svg' },
  { name: 'Iced Coffee',   file: 'assets/stickers/iced-coffee.svg' },
  { name: 'Latte Heart',   file: 'assets/stickers/latte-heart.svg' },
  { name: 'But First...',  file: 'assets/stickers/but-first-coffee.svg' },
  { name: 'Donut',         file: 'assets/stickers/donut.svg' },

  // Work / Grind (2026-05 pack)
  { name: 'Laptop',        file: 'assets/stickers/laptop.svg' },
  { name: 'On The Grind',  file: 'assets/stickers/grinding.svg' },
  { name: 'Money Bag',     file: 'assets/stickers/money-bag.svg' },
  { name: 'Briefcase',     file: 'assets/stickers/briefcase.svg' },
  { name: 'Boss Mode',     file: 'assets/stickers/boss-mode.svg' },

  // Music (2026-05 pack)
  { name: 'Music Note',    file: 'assets/stickers/music-note.svg' },
  { name: 'Headphones',    file: 'assets/stickers/headphones.svg' },
  { name: 'Vinyl Record',  file: 'assets/stickers/vinyl-record.svg' },
  { name: 'Mixtape',       file: 'assets/stickers/cassette.svg' },
  { name: 'Microphone',    file: 'assets/stickers/microphone.svg' },

  // Movies (2026-05 pack)
  { name: 'Clapboard',     file: 'assets/stickers/clapboard.svg' },
  { name: 'Popcorn',       file: 'assets/stickers/popcorn.svg' },
  { name: 'Film Reel',     file: 'assets/stickers/film-reel.svg' },
  { name: '3D Glasses',    file: 'assets/stickers/3d-glasses.svg' },
  { name: 'Movie Ticket',  file: 'assets/stickers/movie-ticket.svg' },

  // Music player widgets (2026-05-14 pack)
  { name: 'Music Player',  file: 'assets/stickers/music-player.svg' },
  { name: 'Now Playing',   file: 'assets/stickers/now-playing.svg' },

  // Snacks (2026-05-14 pack)
  { name: 'Pizza Slice',   file: 'assets/stickers/pizza-slice.svg' },
  { name: 'Burger',        file: 'assets/stickers/burger.svg' },
  { name: 'Fries',         file: 'assets/stickers/fries.svg' },
  { name: 'Ice Cream',     file: 'assets/stickers/ice-cream.svg' },
  { name: 'Sushi',         file: 'assets/stickers/sushi.svg' },
  { name: 'Ramen',         file: 'assets/stickers/ramen.svg' },
  { name: 'Cupcake',       file: 'assets/stickers/cupcake.svg' },
  { name: 'Lollipop',      file: 'assets/stickers/lollipop.svg' },
  { name: 'Hot Dog',       file: 'assets/stickers/hotdog.svg' },
  { name: 'Cookie',        file: 'assets/stickers/cookie.svg' },
  { name: 'Taco',          file: 'assets/stickers/taco.svg' },
];

const stickerImgCache = {};

function initStickers() {
  // Preload all SVGs into cache for instant canvas drawing.
  // iOS Safari treats SVG images as a source of canvas tainting in some
  // versions, even when same-origin. To dodge this, we fetch each SVG as
  // a blob and load it via blob: URL — these are universally treated as
  // clean same-origin sources.
  STICKERS.forEach(s => {
    const img = new Image();
    stickerImgCache[s.file] = img;
    fetch(s.file)
      .then(r => r.ok ? r.blob() : Promise.reject(r.status))
      .then(blob => { img.src = URL.createObjectURL(blob); })
      .catch(() => { img.src = s.file; });  // Fallback to direct load if fetch fails
  });

  const grid = document.getElementById('stickers-grid');
  grid.innerHTML = '';
  STICKERS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'sticker-card';
    btn.title = s.name;
    const img = document.createElement('img');
    img.src = s.file;
    img.alt = s.name;
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener('click', () => addSticker(s));
    grid.appendChild(btn);
  });

  setupStickerDrag();
}

function addSticker(s) {
  stickers.push({
    file: s.file,
    x:    0.25 + Math.random() * 0.5,
    y:    0.25 + Math.random() * 0.5,
    size: 70,
  });
  if (shots.length > 0) buildStrip();
  showToast(s.name + ' added drag to reposition');
}

function setupStickerDrag() {
  const sc = document.getElementById('strip-canvas');
  let dragging = null;
  let offX = 0, offY = 0;

  function getRelPos(e) {
    const rect = sc.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) / rect.width,
      y: (src.clientY - rect.top)  / rect.height,
    };
  }

  function onDown(e) {
    if (!stickers.length || !sc.classList.contains('show')) return;
    const pos = getRelPos(e);
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s  = stickers[i];
      const hw = (s.size * 0.6) / sc.width;
      const hh = (s.size * 0.6) / sc.height;
      if (Math.abs(pos.x - s.x) < hw && Math.abs(pos.y - s.y) < hh) {
        dragging = i;
        offX = pos.x - s.x;
        offY = pos.y - s.y;
        e.preventDefault();
        return;
      }
    }
  }

  function onMove(e) {
    if (dragging === null) return;
    e.preventDefault();
    const pos = getRelPos(e);
    stickers[dragging].x = Math.max(0, Math.min(1, pos.x - offX));
    stickers[dragging].y = Math.max(0, Math.min(1, pos.y - offY));
    buildStrip();
  }

  function onUp() { dragging = null; }

  sc.addEventListener('mousedown',  onDown);
  sc.addEventListener('mousemove',  onMove);
  sc.addEventListener('mouseup',    onUp);
  sc.addEventListener('mouseleave', onUp);
  sc.addEventListener('touchstart', onDown, { passive: false });
  sc.addEventListener('touchmove',  onMove, { passive: false });
  sc.addEventListener('touchend',   onUp);
}
