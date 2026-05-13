// In-app browser detection + "Open in browser" banner.
// FB / IG / Messenger / TikTok / Twitter WebViews block <a download> and the
// Web Share API for files, so downloads silently fail. We detect the WebView
// from the UA and show a banner asking the user to open in a real browser.

(function () {
  const ua = navigator.userAgent || '';
  const isFB = /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua);
  const isIG = /Instagram/i.test(ua);
  const isMsg = /Messenger/i.test(ua) || /MessengerLite/i.test(ua);
  const isTT = /TikTok|BytedanceWebview|musical_ly/i.test(ua);
  const isTw = /Twitter/i.test(ua);
  const isLine = /Line\//i.test(ua);
  const isInApp = isFB || isIG || isMsg || isTT || isTw || isLine;

  if (!isInApp) return;

  let appName = 'this app';
  if (isFB) appName = 'Facebook';
  else if (isIG) appName = 'Instagram';
  else if (isMsg) appName = 'Messenger';
  else if (isTT) appName = 'TikTok';
  else if (isTw) appName = 'X (Twitter)';
  else if (isLine) appName = 'Line';

  if (sessionStorage.getItem('sb_inapp_dismissed') === '1') return;

  const banner = document.createElement('div');
  banner.id = 'sb-inapp-banner';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;' +
    'background:#fff7d6;color:#5a4a10;border-bottom:1px solid #f0d97a;' +
    'padding:10px 14px;font:500 13px/1.4 "DM Sans",system-ui,sans-serif;' +
    'display:flex;align-items:center;gap:10px;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.08);';

  banner.innerHTML =
    '<div style="flex:1;min-width:0">' +
      '<strong>Downloads don\'t work in ' + appName + '.</strong> ' +
      'Tap the <strong>⋯</strong> menu (top-right) → ' +
      '<strong>"Open in Browser"</strong> or <strong>"Open in Chrome"</strong> to save your photos.' +
    '</div>' +
    '<button type="button" id="sb-inapp-copy" ' +
      'style="background:#5a4a10;color:#fff7d6;border:0;padding:7px 12px;border-radius:8px;font:600 12px/1 \'DM Sans\',sans-serif;cursor:pointer;flex-shrink:0">' +
      'Copy link</button>' +
    '<button type="button" id="sb-inapp-close" aria-label="Dismiss" ' +
      'style="background:transparent;border:0;color:#5a4a10;font-size:20px;line-height:1;padding:4px 8px;cursor:pointer;flex-shrink:0">' +
      '×</button>';

  document.body.appendChild(banner);

  // Push body content down so banner doesn't overlap the header.
  const pad = banner.offsetHeight + 'px';
  document.body.style.paddingTop = pad;

  document.getElementById('sb-inapp-close').addEventListener('click', () => {
    sessionStorage.setItem('sb_inapp_dismissed', '1');
    banner.remove();
    document.body.style.paddingTop = '';
  });

  document.getElementById('sb-inapp-copy').addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById('sb-inapp-copy');
      btn.textContent = 'Copied!';
      setTimeout(() => { if (btn) btn.textContent = 'Copy link'; }, 2000);
    } catch (e) {
      prompt('Copy this link and paste it in your browser:', url);
    }
  });
})();
