(() => {

  if (window.__elementHiderLoaded) return;
  window.__elementHiderLoaded = true;
  let pickingMode = false;
  let overlay = null;
  let tooltip = null;
  let currentTarget = null;

  // ============ YARDIMCILAR ============

  function getDomain() {
    return location.hostname;
  }

  function storageKey() {
    return `hidden_${getDomain()}`;
  }

  // Benzersiz bir CSS seçici üret
  function getUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return null;

    // id varsa direkt kullan
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }

    // class + tag kombinasyonu dene
    const parts = [];
    let current = el;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 5) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(Boolean);
        if (classes.length) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      // Eğer kardeşler arasında birden fazla varsa nth-of-type ekle
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(selector);

      // Bu selector ile tek eleman bulunabiliyorsa dur
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch (e) { /* geçersiz selector */ }

      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  // Seçiciyi uygula (gizle)
  function applyHidden(selector) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('data-eh-hidden', '1');
      }
    } catch (e) { /* geçersiz */ }
  }

  // Kaydedilmiş gizli elementleri uygula
  async function applySaved() {
    const key = storageKey();
    const data = await chrome.storage.local.get(key);
    const items = data[key] || [];
    items.forEach(item => applyHidden(item.selector));
  }

  // ============ SEÇİM MODU ============

  function startPicking() {
    if (pickingMode) return;
    pickingMode = true;
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    if (!document.body.hasAttribute('tabindex')) {
      document.body.setAttribute('tabindex', '-1');
    }
    document.body.focus();
    // Overlay (şeffaf mavi katman)
    overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: rgba(64, 156, 255, 0.25);
      border: 2px solid #409cff;
      z-index: 2147483646;
      transition: all 0.05s ease;
      box-sizing: border-box;
    `;
    document.documentElement.appendChild(overlay);

    // Tooltip (etiket bilgisi)
    tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed;
      background: #1e1e1e;
      color: #4ec9b0;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      z-index: 2147483647;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    document.documentElement.appendChild(tooltip);

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function stopPicking() {
    pickingMode = false;
    if (overlay) overlay.remove();
    if (tooltip) tooltip.remove();
    overlay = null;
    tooltip = null;
    currentTarget = null;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onMouseMove(e) {
    if (!pickingMode) return;
    const el = e.target;
    if (!el || el === overlay || el === tooltip) return;
    if (el === document.documentElement || el === document.body) return;

    currentTarget = el;
    const rect = el.getBoundingClientRect();

    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const selector = getUniqueSelector(el);
    tooltip.textContent = selector || el.tagName.toLowerCase();

    // Tooltip pozisyonu
    let top = rect.top - 26;
    if (top < 0) top = rect.bottom + 4;
    tooltip.style.top = top + 'px';
    tooltip.style.left = rect.left + 'px';
  }

  async function onClick(e) {
    if (!pickingMode) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    if (!el || el === overlay || el === tooltip) return;

    const selector = getUniqueSelector(el);
    if (!selector) return;

    // Gizle
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('data-eh-hidden', '1');

    // Storage'a kaydet
    const key = storageKey();
    const data = await chrome.storage.local.get(key);
    const items = data[key] || [];
    if (!items.some(i => i.selector === selector)) {
      items.push({ selector, tag: el.tagName.toLowerCase() });
      await chrome.storage.local.set({ [key]: items });
    }

    // Popup'a bildir
    chrome.runtime.sendMessage({ action: 'updateList' }).catch(() => { });

    stopPicking();
  }
  function onKeyDown(e) {
    const isEsc = e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27;
    const isBack = e.key === 'Backspace' || e.keyCode === 8;

    if (isEsc || isBack) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      stopPicking();
      // Popup'a haber ver
      chrome.runtime.sendMessage({ action: 'pickingStopped' }).catch(() => { });
      return false;
    }
  }

  // ============ GÖSTER ============

  async function showElement(selector) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.style.removeProperty('display');
        el.removeAttribute('data-eh-hidden');
      }
    } catch (e) { /* geçersiz */ }

    // Storage'dan kaldır
    const key = storageKey();
    const data = await chrome.storage.local.get(key);
    const items = (data[key] || []).filter(i => i.selector !== selector);
    await chrome.storage.local.set({ [key]: items });

    chrome.runtime.sendMessage({ action: 'updateList' }).catch(() => { });
  }

  // ============ MESAJ DİNLEYİCİ ============

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'startPicking') {
      startPicking();
      // Popup'a "seçim başladı" bildir
      chrome.runtime.sendMessage({ action: 'pickingStarted' }).catch(() => { });
      sendResponse({ ok: true });
    } else if (msg.action === 'cancelPicking') {
      stopPicking();
      chrome.runtime.sendMessage({ action: 'pickingStopped' }).catch(() => { });
      sendResponse({ ok: true });
    } else if (msg.action === 'isPicking') {
      sendResponse({ picking: pickingMode });
    } else if (msg.action === 'showElement') {
      showElement(msg.selector);
      sendResponse({ ok: true });
    }
    return true;
  });

  // Sayfa yüklendiğinde kaydedilmiş gizlemeleri uygula
  applySaved();

  // SPA sayfa değişiklikleri için tekrar uygula
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(applySaved, 300);
    }
  }, 500);
})();