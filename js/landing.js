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
  const sel = '.strip-photo img, .sc-frame--real img.sc-preview';
  document.querySelectorAll(sel).forEach(img => {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('sb-loaded');
    } else {
      img.addEventListener('load',  () => img.classList.add('sb-loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('sb-loaded'), { once: true });
    }
  });
})();
