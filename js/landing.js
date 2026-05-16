// ── Scroll animations ──
const observer = new IntersectionObserver(
  entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0, rootMargin: '50px' }
);
document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

// ── FAQ accordion ──
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ── Mobile nav toggle ──
const hamburger = document.getElementById('nav-hamburger');
const mobileMenu = document.getElementById('mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const open = mobileMenu.style.display === 'flex';
    mobileMenu.style.display = open ? 'none' : 'flex';
    hamburger.setAttribute('aria-expanded', String(!open));
  });
}

// ── Trigger hero elements immediately ──
document.querySelectorAll('.hero [data-animate]').forEach((el, i) => {
  setTimeout(() => el.classList.add('visible'), i * 120);
});

// ── Skeleton-loader hook ──
// Adds .sb-loaded to any image inside .strip-photo or .sc-frame--real once
// the image finishes loading. CSS fades the image in and stops the parent
// container's shimmer animation.
(function () {
  const sel = '.strip-photo img, .sc-frame--real img.sc-preview, .mq-strip img';
  document.querySelectorAll(sel).forEach(img => {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('sb-loaded');
    } else {
      img.addEventListener('load',  () => img.classList.add('sb-loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('sb-loaded'), { once: true });
    }
  });
})();

// ── Hero enhancements (GSAP-driven) ─────────────────────────────────
// 1. Mouse-parallax on the strip cards — they drift slightly with cursor
// 2. Magnetic CTA buttons — subtle pull toward the cursor when nearby
// 3. Floating sparkles spawned around the hero
// 4. Respects prefers-reduced-motion: skips all of the above
(function initHeroAnimations() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // GSAP loads with `defer`, so it may not exist yet on first parse.
  // Poll briefly, then bail if it never arrives (e.g. CDN blocked).
  function whenReady(cb, tries = 0) {
    if (window.gsap) return cb(window.gsap);
    if (tries > 40) return;  // ~4s timeout
    setTimeout(() => whenReady(cb, tries + 1), 100);
  }

  whenReady(gsap => {
    // ── Mouse-parallax for the strip cards ──
    const scene = document.querySelector('.strips-scene');
    const cards = document.querySelectorAll('.strips-scene .strip-card');
    if (scene && cards.length) {
      // Each card gets its own depth — back layer moves less, front layer moves more.
      const depths = [10, 18, 26];
      const xTos = [], yTos = [];
      cards.forEach((card, i) => {
        xTos.push(gsap.quickTo(card, 'x', { duration: 0.8, ease: 'power3.out' }));
        yTos.push(gsap.quickTo(card, 'y', { duration: 0.8, ease: 'power3.out' }));
      });
      scene.addEventListener('mousemove', e => {
        const r = scene.getBoundingClientRect();
        // Normalize cursor to -1..1 from scene center
        const nx = ((e.clientX - r.left) / r.width  - 0.5) * 2;
        const ny = ((e.clientY - r.top)  / r.height - 0.5) * 2;
        cards.forEach((_, i) => {
          xTos[i](nx * (depths[i] || 14));
          yTos[i](ny * (depths[i] || 14));
        });
      });
      scene.addEventListener('mouseleave', () => {
        cards.forEach((_, i) => { xTos[i](0); yTos[i](0); });
      });
    }

    // ── Magnetic CTA buttons ──
    document.querySelectorAll('.hero .cta-primary').forEach(btn => {
      const xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
      const yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Pull strength scales with distance from center — clamped so the
        // button doesn't fly off when the cursor sits at an extreme corner.
        xTo((e.clientX - cx) * 0.25);
        yTo((e.clientY - cy) * 0.35);
      });
      btn.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
    });

    // ── Floating sparkles ──
    // Spawn 8 sparkles at random positions in the hero, with looping
    // float + fade. Pure decoration, but adds the "magic photo booth"
    // feel that the feedback called out as missing.
    const sparkleLayer = document.querySelector('.hero-sparkles');
    if (sparkleLayer) {
      const glyphs = ['✦', '✧', '✿', '♡', '✨', '⋆'];
      for (let i = 0; i < 10; i++) {
        const s = document.createElement('span');
        s.className = 'hero-sparkle';
        s.textContent = glyphs[i % glyphs.length];
        s.style.left = (5 + Math.random() * 90) + '%';
        s.style.top  = (5 + Math.random() * 90) + '%';
        s.style.color = ['#ffd166', '#ff8fab', '#79ffe1', '#c9a07a'][i % 4];
        s.style.fontSize = (12 + Math.random() * 14) + 'px';
        sparkleLayer.appendChild(s);

        gsap.to(s, {
          opacity: 0.85,
          duration: 0.6 + Math.random() * 0.6,
          delay: 0.4 + i * 0.18,
        });
        gsap.to(s, {
          y: '-=' + (16 + Math.random() * 20),
          x: '+=' + (Math.random() * 24 - 12),
          rotation: Math.random() * 30 - 15,
          duration: 3 + Math.random() * 3,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 0.4 + i * 0.18,
        });
        gsap.to(s, {
          opacity: 0.3,
          duration: 2 + Math.random() * 2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 1 + i * 0.18,
        });
      }
    }

    // (Hero-content entrance is handled by the existing [data-animate]
    // IntersectionObserver above — don't double-animate or they conflict.)
  });
})();
