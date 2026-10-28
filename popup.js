const hideBtn = document.getElementById('hideBtn');
const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const cancelBtn = document.getElementById('cancelBtn');
loadList();
cancelBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  chrome.tabs.sendMessage(tab.id, { action: 'cancelPicking' }, () => {
    window.close();
  });
});

// Popup her açıldığında seçim modunun açık olup olmadığını kontrol et
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { action: 'isPicking' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res && res.picking) {
      cancelBtn.style.display = 'block';
      hideBtn.textContent = '🔴 Seçim Modu Aktif';
      hideBtn.disabled = true;
    }
  });
})();
hideBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // chrome:// gibi korumalı sayfalarda çalışmaz
  if (!tab.url || !/^https?:|^file:/.test(tab.url)) {
    statusEl.textContent = 'Bu sayfada çalıştırılamaz.';
    return;
  }

  try {
    // Önce content script'i manuel enjekte et (zaten varsa hata vermez, üzerine yazmaz)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ['content.js']
    });
  } catch (e) {
    // Zaten enjekte edilmişse veya izin yoksa sessizce geç
    console.warn('inject:', e);
  }

  // Şimdi mesaj gönder
  chrome.tabs.sendMessage(tab.id, { action: 'startPicking' }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = 'Hata: ' + chrome.runtime.lastError.message;
      return;
    }
    window.close();
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateList') loadList();
});

chrome.storage.onChanged.addListener(() => loadList());

async function loadList() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    listEl.innerHTML = '<div class="empty">Aktif sekme yok.</div>';
    return;
  }

  const key = `hidden_${getDomain(tab.url)}`;
  const data = await chrome.storage.local.get(key);
  const items = data[key] || [];
  renderList(items, tab.id);
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function renderList(items, tabId) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">Henüz element gizlenmedi.</div>';
    return;
  }

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'item';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = item.selector;
    label.title = item.selector;

    const btn = document.createElement('button');
    btn.textContent = 'Göster';
    btn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tabId, {
        action: 'showElement',
        selector: item.selector
      });
    });

    div.appendChild(label);
    div.appendChild(btn);
    listEl.appendChild(div);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateList') {
    loadList();
  } else if (msg.action === 'pickingStarted') {
    cancelBtn.style.display = 'block';
    hideBtn.textContent = '🔴 Seçim Modu Aktif';
    hideBtn.disabled = true;
  } else if (msg.action === 'pickingStopped') {
    cancelBtn.style.display = 'none';
    hideBtn.textContent = '🔴 Gizle (Seçim Modu)';
    hideBtn.disabled = false;
  }
});