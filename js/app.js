// Le Résumeur - Core Application Logic & UI Controllers

// --- GLOBAL STATE ---
let state = {
  sites: [],
  selectedSiteId: null,
  activeTagFilter: 'all',
  searchQuery: '',
  isCheckingAll: false,
  activeDetailTab: 'summary' // 'summary' | 'diff' | 'history'
};

// --- MARKDOWN MINIMAL PARSER ---
function parseMarkdown(text) {
  if (!text) return '<p class="diff-empty">Aucun contenu.</p>';
  
  let html = text
    // Escaping HTML characters to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Headings
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // Bullet Lists
  const lines = html.split('\n');
  let inList = false;
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      let content = trimmed.substring(2);
      let listHTML = '';
      if (!inList) {
        inList = true;
        listHTML += '<ul>';
      }
      listHTML += `<li>${content}</li>`;
      return listHTML;
    } else {
      let listHTML = '';
      if (inList) {
        inList = false;
        listHTML += '</ul>';
      }
      return listHTML + line;
    }
  });
  
  if (inList) {
    processedLines.push('</ul>');
  }

  html = processedLines.join('\n');
  
  // Paragraphs
  html = html.split(/\n{2,}/g).map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<li') || p.startsWith('</ul')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

// --- HTML CLEANER & TEXT EXTRACTOR ---
function cleanHTML(htmlString, selector = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  let rootElement = doc.body;
  if (selector) {
    const selected = doc.querySelector(selector);
    if (selected) rootElement = selected;
  }
  
  // Clone element to prevent mutations
  const clone = rootElement.cloneNode(true);
  
  // Remove non-content elements
  const elementsToRemove = clone.querySelectorAll(
    'script, style, link, noscript, iframe, svg, img, video, audio, nav, footer, header, form, aside, button, .menu, .sidebar, .ads, [role="banner"], [role="navigation"], [role="contentinfo"]'
  );
  elementsToRemove.forEach(el => el.remove());
  
  // Extract text line by line
  let text = clone.innerText || clone.textContent || '';
  
  // Clean whitespace
  const cleanLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
    
  return cleanLines.join('\n');
}

// --- DIFF COMPUTATION ENGINE (LCS Based) ---
function computeTextDiff(oldText, newText) {
  if (!oldText) return [{ type: 'added', text: newText }];
  if (!newText) return [{ type: 'removed', text: oldText }];

  const oldLines = oldText.split('\n').map(l => l.trim()).filter(l => l);
  const newLines = newText.split('\n').map(l => l.trim()).filter(l => l);

  // LCS Grid Initialization
  const dp = Array(oldLines.length + 1).fill().map(() => Array(newLines.length + 1).fill(0));
  
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i-1] === newLines[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }

  const diff = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
      diff.push({ type: 'unchanged', text: oldLines[i-1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      diff.push({ type: 'added', text: newLines[j-1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j-1] < dp[i-1][j])) {
      diff.push({ type: 'removed', text: oldLines[i-1] });
      i--;
    }
  }

  return diff.reverse();
}

// --- CRAWLER / FETCHER SERVICE ---
async function fetchPageContent(url, proxyUrlTemplate) {
  // Try proxying to bypass CORS
  const proxyTemplate = proxyUrlTemplate || 'https://api.allorigins.win/raw?url=';
  const proxiedUrl = proxyTemplate.includes('[URL]') 
    ? proxyTemplate.replace('[URL]', encodeURIComponent(url))
    : `${proxyTemplate}${encodeURIComponent(url)}`;

  try {
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.warn(`Proxy principal a échoué pour ${url}. Tentative avec proxy de secours...`);
    // Backup proxy: corsproxy.io
    try {
      const backupUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const backupResponse = await fetch(backupUrl);
      if (!backupResponse.ok) {
        throw new Error(`HTTP ${backupResponse.status}`);
      }
      return await backupResponse.text();
    } catch (backupError) {
      throw new Error(`Échec de récupération de la page. Raison : ${error.message}`);
    }
  }
}

// --- MOCK DATA FOR DEMO/TESTING ---
const MOCK_PAGES = {
  "https://blog.tech.com": [
    `<h1>Tech Blog</h1><p>Bienvenue sur notre blog.</p><article><h2>Dernières sorties</h2><p>Le nouveau processeur Quantum v1 vient de sortir.</p></article>`,
    `<h1>Tech Blog</h1><p>Bienvenue sur notre blog.</p><article><h2>Dernières sorties</h2><p>Le nouveau processeur Quantum v2 vient de sortir avec 40% de puissance en plus.</p><p>Mis à jour : Support expérimental pour IA locale.</p></article>`
  ]
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker Registered!', reg);
        // Check for updates to sw
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New service worker installed, skipping waiting...');
            }
          });
        });
      })
      .catch(err => console.log('Service Worker registration failed:', err));

    // Auto reload page when new service worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  // Init Theme
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('theme-toggle').innerHTML = '🌙';
  } else {
    document.getElementById('theme-toggle').innerHTML = '☀️';
  }

  // Load API Key
  const apiKey = geminiService.getApiKey();
  if (apiKey) {
    document.getElementById('settings-api-key').value = apiKey;
  }

  // Load Proxy Settings
  const proxy = localStorage.getItem('cors_proxy') || 'https://api.allorigins.win/raw?url=';
  document.getElementById('settings-proxy').value = proxy;

  // Initialize DB and load sites
  try {
    await dbHelper.init();
    await loadSites();
    renderSitesList();
    renderDetailPane();
    renderTagFilters();
  } catch (err) {
    showToast("Erreur d'initialisation de la base de données", 'error');
  }

  // Setup Event Listeners
  setupEventListeners();
  setupDialogFallbacks();
});

// --- LOAD DATA ---
async function loadSites() {
  state.sites = await dbHelper.getAllSites();
  // Sort sites alphabetically safely
  state.sites.sort((a, b) => {
    const titleA = a.title || '';
    const titleB = b.title || '';
    return titleA.localeCompare(titleB);
  });
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);

  // Auto remove toast
  setTimeout(() => {
    toast.style.animation = 'fade-in 0.3s ease reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- RENDER UI ---
function renderSitesList() {
  const listEl = document.getElementById('sites-list');
  listEl.innerHTML = '';

  const filtered = state.sites.filter(site => {
    // Search filter safely
    const title = (site.title || '').toLowerCase();
    const url = (site.url || '').toLowerCase();
    const query = (state.searchQuery || '').toLowerCase();
    
    const matchesSearch = title.includes(query) || url.includes(query);
    
    // Tag filter
    const matchesTag = state.activeTagFilter === 'all' || site.tag === state.activeTagFilter;
    
    return matchesSearch && matchesTag;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem;">
        Aucun site trouvé
      </div>
    `;
    return;
  }

  filtered.forEach(site => {
    const card = document.createElement('div');
    card.className = `site-card ${state.selectedSiteId === site.id ? 'active' : ''}`;
    card.dataset.id = site.id;

    const lastCheckedStr = site.lastChecked 
      ? new Date(site.lastChecked).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : 'Jamais';

    let statusClass = 'up-to-date';
    if (site.status === 'changed') statusClass = 'changed';
    if (site.status === 'error') statusClass = 'error';
    if (site.status === 'checking') statusClass = 'checking';

    card.innerHTML = `
      <div class="site-status-indicator ${statusClass}"></div>
      <div class="site-card-info">
        <div class="site-card-title">${escapeHTML(site.title)}</div>
        <div class="site-card-url">${escapeHTML(site.url)}</div>
        <div class="site-card-meta">
          <span>Dernière vérif. : ${lastCheckedStr}</span>
          ${site.tag ? `<span class="site-card-tag">${escapeHTML(site.tag)}</span>` : ''}
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectSite(site.id);
    });

    listEl.appendChild(card);
  });
}

function renderTagFilters() {
  const container = document.getElementById('tag-filters');
  // Get unique tags
  const tags = new Set();
  state.sites.forEach(s => {
    if (s.tag && s.tag.trim()) tags.add(s.tag.trim());
  });

  let html = `<span class="tag-pill ${state.activeTagFilter === 'all' ? 'active' : ''}" data-tag="all">Tout</span>`;
  tags.forEach(tag => {
    html += `<span class="tag-pill ${state.activeTagFilter === tag ? 'active' : ''}" data-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</span>`;
  });

  container.innerHTML = html;

  // Add click events
  container.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      state.activeTagFilter = e.target.dataset.tag;
      renderTagFilters();
      renderSitesList();
    });
  });
}

async function renderDetailPane() {
  const detailEl = document.getElementById('detail-pane');

  if (!state.selectedSiteId) {
    detailEl.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <div>
          <h2>Bienvenue dans Le Résumeur</h2>
          <p style="margin-top: 0.5rem; max-width: 320px; font-size: 0.9rem;">Sélectionnez un site dans la liste ou ajoutez-en un nouveau pour commencer votre veille.</p>
        </div>
      </div>
    `;
    return;
  }

  const site = state.sites.find(s => s.id === state.selectedSiteId);
  if (!site) return;

  const checkedDateStr = site.lastChecked ? new Date(site.lastChecked).toLocaleString() : 'Jamais';
  const changedDateStr = site.lastChanged ? new Date(site.lastChanged).toLocaleString() : 'Jamais';

  let statusBadge = `<span class="site-tag-badge" style="background: rgba(52, 211, 153, 0.1); color: var(--accent); border-color: rgba(52, 211, 153, 0.2);">À Jour</span>`;
  if (site.status === 'changed') {
    statusBadge = `<span class="site-tag-badge" style="background: rgba(251, 191, 36, 0.1); color: var(--warning); border-color: rgba(251, 191, 36, 0.2); animation: pulse-check 2s infinite alternate;">Modifié</span>`;
  } else if (site.status === 'error') {
    statusBadge = `<span class="site-tag-badge" style="background: rgba(244, 63, 94, 0.1); color: var(--danger); border-color: rgba(244, 63, 94, 0.2);">Erreur</span>`;
  } else if (site.status === 'checking') {
    statusBadge = `<span class="site-tag-badge" style="background: rgba(56, 189, 248, 0.1); color: var(--primary); border-color: rgba(56, 189, 248, 0.2);">Vérification...</span>`;
  }

  // Template construction
  detailEl.innerHTML = `
    <!-- Detail Header -->
    <div class="detail-header">
      <div class="site-identity">
        <div class="site-title-row">
          <button id="detail-back-btn" class="btn btn-secondary btn-icon-only" style="display: none; margin-right: 0.5rem; padding: 0.4rem;">
            <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          </button>
          <h1 class="site-title">${escapeHTML(site.title)}</h1>
          ${site.tag ? `<span class="site-tag-badge">${escapeHTML(site.tag)}</span>` : ''}
          ${statusBadge}
        </div>
        <div style="margin-top: 0.5rem;">
          <a class="site-link" href="${site.url}" target="_blank">
            <span>${escapeHTML(site.url)}</span>
            <svg style="width:14px; height:14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
          </a>
        </div>
        <div class="site-meta-info">
          <span>Dernière vérification : <strong>${checkedDateStr}</strong></span>
          <span>Dernière nouveauté : <strong>${changedDateStr}</strong></span>
        </div>
      </div>
      <div class="detail-actions">
        <button id="btn-check-site" class="btn btn-primary" ${site.status === 'checking' ? 'disabled' : ''}>
          <svg style="width:16px; height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          Vérifier
        </button>
        <button id="btn-edit-site" class="btn btn-secondary btn-icon-only">
          <svg style="width:16px; height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg>
        </button>
        <button id="btn-delete-site" class="btn btn-danger btn-icon-only">
          <svg style="width:16px; height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
        </button>
      </div>
    </div>

    <!-- Detail Tabs -->
    <div style="padding: 1rem 2rem 0 2rem; background: var(--bg-glass);">
      <div class="detail-tabs">
        <button class="tab-btn ${state.activeDetailTab === 'summary' ? 'active' : ''}" data-tab="summary">Résumé IA</button>
        <button class="tab-btn ${state.activeDetailTab === 'diff' ? 'active' : ''}" data-tab="diff">Diff Visuel</button>
        <button class="tab-btn ${state.activeDetailTab === 'history' ? 'active' : ''}" data-tab="history">Historique</button>
      </div>
    </div>

    <!-- Detail Scrollable Content -->
    <div class="detail-content" id="detail-tab-content">
      <!-- Loaded dynamically below -->
    </div>
  `;

  // Render tab content
  renderTabContent(site);

  // Setup header button listeners
  document.getElementById('btn-check-site').addEventListener('click', () => checkSite(site.id));
  document.getElementById('btn-edit-site').addEventListener('click', () => openEditSiteModal(site));
  document.getElementById('btn-delete-site').addEventListener('click', () => deleteSite(site.id));

  // Back button listener for mobile
  const backBtn = document.getElementById('detail-back-btn');
  backBtn.addEventListener('click', () => {
    document.getElementById('detail-pane').classList.remove('visible');
    document.getElementById('sidebar').classList.remove('hidden');
    state.selectedSiteId = null;
    renderSitesList();
  });

  // Check if detail back button should be shown (media query check)
  if (window.innerWidth <= 900) {
    backBtn.style.display = 'inline-flex';
  }

  // Setup tab buttons
  detailEl.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.activeDetailTab = e.target.dataset.tab;
      detailEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderTabContent(site);
    });
  });
}

async function renderTabContent(site) {
  const contentEl = document.getElementById('detail-tab-content');
  contentEl.innerHTML = '';

  if (state.activeDetailTab === 'summary') {
    // RENDER AI SUMMARY
    let itemsHTML = '';
    const hasItems = site.lastExtractedItems && site.lastExtractedItems.length > 0;
    
    if (hasItems) {
      site.lastExtractedItems.forEach((item, idx) => {
        itemsHTML += `
          <label class="extracted-item-card">
            <input type="checkbox" class="extracted-item-checkbox" data-index="${idx}" data-timestamp="${item.timestamp || ''}">
            <div class="extracted-item-content">
              <div class="extracted-item-header">
                <span class="extracted-item-title">${escapeHTML(item.title)}</span>
                <span class="extracted-item-date">${escapeHTML(item.date)}</span>
              </div>
              <div class="extracted-item-summary">${escapeHTML(item.summary)}</div>
            </div>
          </label>
        `;
      });
    } else {
      itemsHTML = `
        <div class="diff-empty">
          Aucune publication individuelle n'a été extraite pour ce site.<br>
          <span style="font-size:0.8rem; opacity:0.8;">Vérifiez que votre clé API Gemini est bien configurée dans les Réglages puis relancez la vérification pour lancer l'extraction automatique des actualités.</span>
        </div>
      `;
    }

    // Paste box HTML if status is error
    const pasteBoxHTML = site.status === 'error' ? `
      <div class="detail-section-card" style="margin-top: 2rem; border-color: var(--danger-glow); background: rgba(244, 63, 94, 0.04);">
        <div class="section-title-row" style="border-bottom-color: rgba(244, 63, 94, 0.1);">
          <div class="section-title" style="color: var(--danger);">
            <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            Échec de récupération automatique (CORS / Blocage)
          </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
          Le serveur de ce site bloque probablement les requêtes provenant de proxies publics (très fréquent pour les mairies/administrations). 
          <strong>Vous pouvez copier-coller le contenu HTML ou texte de la page manuellement :</strong>
        </p>
        <textarea id="manual-paste-area" class="form-control" placeholder="Sur la page du site: faites Ctrl+A puis Ctrl+C, et collez le contenu ici..." style="min-height: 120px; font-family: monospace; font-size: 0.8rem;"></textarea>
        <button id="btn-analyze-pasted" class="btn btn-primary" style="margin-top: 1rem; width: 100%;">
          🔍 Analyser le contenu collé
        </button>
      </div>
    ` : '';

    contentEl.innerHTML = `
      <div class="detail-section-card">
        <div class="section-title-row">
          <div class="section-title">
            <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l8.904-4.43m-8.904-.666L12 15l2.771-.829m-5.462-.514L8.25 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Synthèse de la Veille Intel
          </div>
        </div>
        <div class="summary-container">
          ${parseMarkdown(site.lastSummary || "Aucun résumé n'a encore été généré. Veuillez cliquer sur **Vérifier** pour lancer la première analyse ou utiliser le formulaire d'analyse manuelle ci-dessous.")}
        </div>
      </div>

      ${pasteBoxHTML}

      <div class="detail-section-card" style="margin-top: 2rem;">
        <div class="section-title-row">
          <div class="section-title">
            <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
            Éléments disponibles &amp; Synthèse sur-mesure
          </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Cochez les éléments à intégrer ou utilisez les filtres par période pour cocher rapidement les nouveautés, puis générez une synthèse IA consolidée.
        </p>

        ${hasItems ? `
        <div class="period-filters-row">
          <button class="btn btn-secondary btn-sm period-filter-btn" data-period="all">Tout cocher</button>
          <button class="btn btn-secondary btn-sm period-filter-btn" data-period="week">Cette semaine</button>
          <button class="btn btn-secondary btn-sm period-filter-btn" data-period="month">Ce mois</button>
          <button class="btn btn-secondary btn-sm period-filter-btn" data-period="year">Cette année</button>
          <button class="btn btn-secondary btn-sm period-filter-btn" data-period="none">Décocher tout</button>
        </div>
        ` : ''}

        <div class="extracted-items-list" style="margin-top: 1rem;">
          ${itemsHTML}
        </div>

        ${hasItems ? `
        <button id="btn-generate-consolidated" class="btn btn-primary" style="margin-top: 1.5rem; width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;" disabled>
          ⚡ Générer le résumé de la sélection (0)
        </button>
        ` : ''}
      </div>
    `;

    // Bind listeners
    const btnGenerate = document.getElementById('btn-generate-consolidated');
    if (btnGenerate) {
      const checkboxes = contentEl.querySelectorAll('.extracted-item-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', updateConsolidatedButtonState);
      });

      contentEl.querySelectorAll('.period-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          applyPeriodFilter(e.target.dataset.period, site);
        });
      });

      btnGenerate.addEventListener('click', async () => {
        const checkedBoxes = contentEl.querySelectorAll('.extracted-item-checkbox:checked');
        const selectedItems = [];
        checkedBoxes.forEach(cb => {
          const idx = parseInt(cb.dataset.index);
          selectedItems.push(site.lastExtractedItems[idx]);
        });

        if (selectedItems.length === 0) return;

        const dialog = document.getElementById('custom-summary-dialog');
        const body = document.getElementById('custom-summary-body');
        body.innerHTML = `
          <div style="text-align: center; padding: 3rem 0; display:flex; flex-direction:column; align-items:center; gap:1rem;">
            <div class="site-status-indicator checking" style="width:24px; height:24px;"></div>
            <div>Génération du résumé de votre sélection en cours...</div>
          </div>
        `;
        dialog.showModal();

        try {
          const result = await geminiService.generateConsolidatedSummary(selectedItems);
          body.innerHTML = parseMarkdown(result);
        } catch (error) {
          console.error(error);
          body.innerHTML = `
            <div class="diff-empty" style="color: var(--danger);">
              ❌ Erreur lors de la génération de la synthèse : ${escapeHTML(error.message)}
            </div>
          `;
        }
      });
    }

    // Bind manual paste listener
    const btnAnalyze = document.getElementById('btn-analyze-pasted');
    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', async () => {
        const content = document.getElementById('manual-paste-area').value.trim();
        if (!content) {
          showToast("Veuillez coller du contenu à analyser.", "error");
          return;
        }

        btnAnalyze.disabled = true;
        btnAnalyze.innerHTML = `<span class="site-status-indicator checking" style="width:12px; height:12px; margin-right:4px;"></span> Analyse en cours...`;

        try {
          const cleanText = content.startsWith('<') ? cleanHTML(content, site.selector) : content;
          if (!cleanText) {
            throw new Error("L'extraction textuelle a échoué. Le contenu est peut-être vide.");
          }

          const oldText = site.lastTextContent || '';
          let summary = '';
          let extractedItems = [];

          if (geminiService.hasApiKey()) {
            summary = await geminiService.generateSummary(cleanText, oldText);
            try {
              extractedItems = await geminiService.extractItems(cleanText);
            } catch (e) {
              console.warn("Échec d'extraction des éléments par l'IA : ", e);
            }
          } else {
            summary = "⚠️ **Résumé impossible** : Clé API Gemini non configurée. Veuillez ajouter votre clé dans les réglages.";
          }

          site.status = 'up-to-date';
          site.lastChecked = Date.now();
          site.lastChanged = oldText ? Date.now() : site.lastChanged;
          site.lastSummary = summary;
          site.lastTextContent = cleanText;
          site.lastExtractedItems = extractedItems;

          await dbHelper.updateSite(site);
          await dbHelper.addHistory({
            siteId: site.id,
            timestamp: Date.now(),
            status: 'up-to-date',
            summary: summary,
            rawText: cleanText
          });

          showToast("Contenu analysé et enregistré avec succès !", "success");
          await loadSites();
          renderSitesList();
          renderDetailPane();
        } catch (error) {
          console.error(error);
          showToast(`Erreur d'analyse : ${error.message}`, "error");
          btnAnalyze.disabled = false;
          btnAnalyze.innerHTML = `🔍 Analyser le contenu collé`;
        }
      });
    }
  } else if (state.activeDetailTab === 'diff') {
    // RENDER VISUAL DIFF
    contentEl.innerHTML = `
      <div class="detail-section-card">
        <div class="section-title-row">
          <div class="section-title">
            <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
            Modifications Détectées (Dernier Diff)
          </div>
        </div>
        <div class="diff-viewer" id="diff-container">
          <div class="skeleton" style="height: 20px; width: 80%; margin-bottom: 8px;"></div>
          <div class="skeleton" style="height: 20px; width: 60%; margin-bottom: 8px;"></div>
          <div class="skeleton" style="height: 20px; width: 90%;"></div>
        </div>
      </div>
    `;

    // Compute diff asynchronously to avoid freezing the UI thread if content is heavy
    setTimeout(async () => {
      const diffContainer = document.getElementById('diff-container');
      if (!diffContainer) return;

      const history = await dbHelper.getHistoryForSite(site.id);
      
      // We look for the most recent 'changed' event to display diff against its previous
      const changedRecord = history.find(h => h.status === 'changed');
      
      if (!changedRecord || !changedRecord.diffText) {
        // Fallback: If no diff text stored, compute it using current content and previous record
        if (history.length >= 2) {
          const currentText = history[0].rawText || '';
          const previousText = history[1].rawText || '';
          const diffs = computeTextDiff(previousText, currentText);
          renderDiffLines(diffContainer, diffs);
        } else {
          diffContainer.innerHTML = '<div class="diff-empty">Historique insuffisant pour générer un diff visuel. Attendez la prochaine modification.</div>';
        }
      } else {
        // Parse the stored diff lines
        try {
          const diffs = JSON.parse(changedRecord.diffText);
          renderDiffLines(diffContainer, diffs);
        } catch (e) {
          // If not JSON, render it as plain text
          diffContainer.textContent = changedRecord.diffText;
        }
      }
    }, 50);
  } else if (state.activeDetailTab === 'history') {
    // RENDER HISTORY TIMELINE
    contentEl.innerHTML = `
      <div class="detail-section-card">
        <div class="section-title-row">
          <div class="section-title">
            <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Journal d'activité
          </div>
        </div>
        <div class="history-list" id="history-container">
          <div style="text-align:center; padding:1rem;"><span class="skeleton" style="display:inline-block; width:100px; height:15px;"></span></div>
        </div>
      </div>
    `;

    setTimeout(async () => {
      const historyContainer = document.getElementById('history-container');
      if (!historyContainer) return;

      const history = await dbHelper.getHistoryForSite(site.id);
      if (history.length === 0) {
        historyContainer.innerHTML = '<div class="diff-empty">Aucune activité enregistrée.</div>';
        return;
      }

      historyContainer.innerHTML = '';
      history.forEach(item => {
        const dateStr = new Date(item.timestamp).toLocaleString();
        
        let statusBadge = '';
        if (item.status === 'changed') {
          statusBadge = `<span class="history-badge" style="background: rgba(251, 191, 36, 0.15); color: var(--warning);">Modifié</span>`;
        } else if (item.status === 'error') {
          statusBadge = `<span class="history-badge" style="background: rgba(244, 63, 94, 0.15); color: var(--danger);">Erreur</span>`;
        } else {
          statusBadge = `<span class="history-badge" style="background: rgba(52, 211, 153, 0.15); color: var(--accent);">À Jour</span>`;
        }

        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div>
            <strong>${dateStr}</strong>
            <div style="font-size:0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
              ${item.summary ? item.summary.substring(0, 100) + '...' : 'Aucun résumé associé'}
            </div>
          </div>
          ${statusBadge}
        `;
        historyContainer.appendChild(div);
      });
    }, 50);
  }
}

function applyPeriodFilter(period, site) {
  if (!site.lastExtractedItems) return;
  const now = Date.now();
  let threshold = 0;
  
  if (period === 'week') threshold = now - 7 * 24 * 60 * 60 * 1000;
  else if (period === 'month') threshold = now - 30 * 24 * 60 * 60 * 1000;
  else if (period === 'year') threshold = now - 365 * 24 * 60 * 60 * 1000;

  const checkboxes = document.querySelectorAll('.extracted-item-checkbox');
  checkboxes.forEach(cb => {
    const timestampStr = cb.dataset.timestamp;
    if (period === 'all') {
      cb.checked = true;
    } else if (period === 'none') {
      cb.checked = false;
    } else {
      const timestamp = parseInt(timestampStr);
      cb.checked = !isNaN(timestamp) && timestamp >= threshold;
    }
  });
  updateConsolidatedButtonState();
}

function updateConsolidatedButtonState() {
  const checkboxes = document.querySelectorAll('.extracted-item-checkbox:checked');
  const btn = document.getElementById('btn-generate-consolidated');
  if (!btn) return;
  
  btn.disabled = checkboxes.length === 0;
  btn.innerHTML = `⚡ Générer le résumé de la sélection (${checkboxes.length})`;
}

function renderDiffLines(container, diffs) {
  container.innerHTML = '';
  
  // Check if there are actual changes
  const hasChanges = diffs.some(d => d.type === 'added' || d.type === 'removed');
  if (!hasChanges) {
    container.innerHTML = '<div class="diff-empty">Aucun changement de contenu textuel détecté (les textes sont identiques).</div>';
    return;
  }

  diffs.forEach(line => {
    const el = document.createElement('span');
    el.className = `diff-line ${line.type}`;
    
    let prefix = '  ';
    if (line.type === 'added') prefix = '+ ';
    if (line.type === 'removed') prefix = '- ';
    
    el.textContent = `${prefix}${line.text}`;
    container.appendChild(el);
  });
}

// --- ACTIONS & OPERATIONS ---

function selectSite(id) {
  state.selectedSiteId = id;
  
  // Show detail pane on mobile
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('detail-pane').classList.add('visible');
  }

  renderSitesList();
  renderDetailPane();
}

async function checkSite(id) {
  const siteIndex = state.sites.findIndex(s => s.id === id);
  if (siteIndex === -1) return;

  const site = state.sites[siteIndex];
  
  // Update status to checking
  site.status = 'checking';
  site.lastChecked = Date.now();
  await dbHelper.updateSite(site);
  renderSitesList();
  if (state.selectedSiteId === id) renderDetailPane();

  try {
    let rawHTML = '';
    
    // Check if it's our mock demo site
    if (site.url.includes('blog.tech.com')) {
      // Simulate network wait
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Switch mock page variations on subsequent runs
      const step = localStorage.getItem('mock_step') || '0';
      const variant = parseInt(step) % 2;
      rawHTML = MOCK_PAGES["https://blog.tech.com"][variant];
      localStorage.setItem('mock_step', (parseInt(step) + 1).toString());
    } else {
      const proxy = localStorage.getItem('cors_proxy');
      rawHTML = await fetchPageContent(site.url, proxy);
    }

    const cleanText = cleanHTML(rawHTML, site.selector);
    if (!cleanText) {
      throw new Error("Le contenu extrait est vide. Vérifiez votre sélecteur CSS.");
    }

    // Compare with old text
    const oldText = site.lastTextContent || '';
    
    // If text is same
    if (oldText && oldText === cleanText) {
      // If we don't have extracted items (e.g. key was added later), try to extract them now
      if ((!site.lastExtractedItems || site.lastExtractedItems.length === 0) && geminiService.hasApiKey()) {
        try {
          const extracted = await geminiService.extractItems(cleanText);
          if (extracted && extracted.length > 0) {
            site.lastExtractedItems = extracted;
            await dbHelper.updateSite(site);
          }
        } catch (err) {
          console.warn("Échec d'extraction des éléments :", err);
        }
      }

      site.status = 'up-to-date';
      await dbHelper.updateSite(site);
      
      await dbHelper.addHistory({
        siteId: site.id,
        timestamp: Date.now(),
        status: 'up-to-date',
        rawText: cleanText
      });
      
      showToast(`Vérification terminée pour ${site.title} : Aucun changement.`, 'success');
    } else {
      // Content changed! (or first fetch)
      let summary = '';
      let diffJsonString = '';
      let extractedItems = site.lastExtractedItems || [];

      if (geminiService.hasApiKey()) {
        // Trigger Gemini Summary
        summary = await geminiService.generateSummary(cleanText, oldText);
        // Trigger Gemini Extraction
        try {
          extractedItems = await geminiService.extractItems(cleanText);
        } catch (err) {
          console.warn("Échec d'extraction des éléments par l'IA : ", err);
        }
      } else {
        summary = "⚠️ **Résumé impossible** : Clé API Gemini non configurée. Veuillez ajouter votre clé dans les réglages pour activer la synthèse IA.";
      }

      // Compute visual diff lines to store
      const diffLines = computeTextDiff(oldText, cleanText);
      diffJsonString = JSON.stringify(diffLines);

      site.status = oldText ? 'changed' : 'up-to-date'; // first fetch isn't marked as changed, it's just initialized
      site.lastChanged = oldText ? Date.now() : site.lastChanged;
      site.lastSummary = summary;
      site.lastTextContent = cleanText;
      site.lastExtractedItems = extractedItems;
      
      await dbHelper.updateSite(site);

      await dbHelper.addHistory({
        siteId: site.id,
        timestamp: Date.now(),
        status: oldText ? 'changed' : 'up-to-date',
        summary: summary,
        diffText: diffJsonString,
        rawText: cleanText
      });

      if (oldText) {
        showToast(`Changements détectés et résumés pour ${site.title} !`, 'success');
      } else {
        showToast(`Site ${site.title} initialisé avec succès.`, 'success');
      }
    }
  } catch (error) {
    console.error(error);
    site.status = 'error';
    await dbHelper.updateSite(site);
    
    await dbHelper.addHistory({
      siteId: site.id,
      timestamp: Date.now(),
      status: 'error',
      rawText: error.message
    });
    
    showToast(`Erreur lors de la vérification de ${site.title} : ${error.message}`, 'error');
  }

  await loadSites();
  renderSitesList();
  if (state.selectedSiteId === id) renderDetailPane();
}

async function checkAllSites() {
  if (state.isCheckingAll || state.sites.length === 0) return;
  
  state.isCheckingAll = true;
  document.getElementById('btn-check-all').disabled = true;
  document.getElementById('btn-check-all').innerHTML = `<span class="site-status-indicator checking" style="width:12px; height:12px; margin-right:4px;"></span> Vérification globale...`;
  
  showToast("Lancement de la vérification de tous les sites...", "info");

  // Run checks in sequence to not abuse the Gemini API limit & proxy
  for (let site of state.sites) {
    try {
      await checkSite(site.id);
    } catch (e) {
      console.error(e);
    }
  }

  state.isCheckingAll = false;
  document.getElementById('btn-check-all').disabled = false;
  document.getElementById('btn-check-all').innerHTML = `
    <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
    Vérifier Tout
  `;
  showToast("Vérification globale terminée !", "success");
}

async function deleteSite(id) {
  const site = state.sites.find(s => s.id === id);
  if (!site) return;

  if (confirm(`Voulez-vous vraiment supprimer la surveillance de ${site.title} ? Tout l'historique sera perdu.`)) {
    await dbHelper.deleteSite(id);
    showToast(`Site ${site.title} supprimé.`, 'info');
    state.selectedSiteId = null;
    await loadSites();
    renderSitesList();
    renderDetailPane();
    renderTagFilters();
  }
}

// --- DIALOG MODALS OPEN/CLOSE ---

function openAddSiteModal() {
  const dialog = document.getElementById('site-dialog');
  document.getElementById('site-dialog-title').textContent = 'Surveiller un nouveau site';
  document.getElementById('site-form-id').value = '';
  document.getElementById('site-form').reset();
  dialog.showModal();
}

function openEditSiteModal(site) {
  const dialog = document.getElementById('site-dialog');
  document.getElementById('site-dialog-title').textContent = 'Modifier le site surveillé';
  document.getElementById('site-form-id').value = site.id;
  document.getElementById('site-title-input').value = site.title;
  document.getElementById('site-url-input').value = site.url;
  document.getElementById('site-selector-input').value = site.selector || '';
  document.getElementById('site-tag-input').value = site.tag || '';
  dialog.showModal();
}

function openSettingsModal() {
  const dialog = document.getElementById('settings-dialog');
  dialog.showModal();
}

// --- EVENT HANDLERS ---
function setupEventListeners() {
  // Search
  document.getElementById('search-bar').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderSitesList();
  });

  // Theme Toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    document.getElementById('theme-toggle').innerHTML = isLight ? '🌙' : '☀️';
  });

  // Modals Buttons
  document.getElementById('btn-add-site').addEventListener('click', openAddSiteModal);
  document.getElementById('fab-add-site').addEventListener('click', openAddSiteModal);
  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-check-all').addEventListener('click', checkAllSites);

  // Close modals
  document.querySelectorAll('dialog .dialog-close-btn, dialog [type="button"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('dialog').close();
    });
  });

  // Site Form Submit
  document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('site-form-id').value;
    const title = document.getElementById('site-title-input').value.trim();
    const url = document.getElementById('site-url-input').value.trim();
    const selector = document.getElementById('site-selector-input').value.trim();
    const tag = document.getElementById('site-tag-input').value.trim();

    if (!title || !url) return;

    const dialog = document.getElementById('site-dialog');
    dialog.close();

    if (id) {
      // Edit
      const site = state.sites.find(s => s.id === id);
      if (site) {
        site.title = title;
        // If url changed, we reset content to trigger fresh fetch
        if (site.url !== url) {
          site.url = url;
          site.lastTextContent = '';
          site.status = 'up-to-date';
        }
        site.selector = selector;
        site.tag = tag;
        await dbHelper.updateSite(site);
        showToast("Site mis à jour.", 'success');
      }
    } else {
      // Add new
      const newSite = {
        id: 'site_' + Date.now(),
        title,
        url,
        selector,
        tag,
        status: 'up-to-date',
        lastChecked: null,
        lastChanged: null,
        lastSummary: '',
        lastTextContent: ''
      };
      await dbHelper.addSite(newSite);
      showToast("Nouveau site ajouté à la veille.", 'success');
      
      // Auto check on add
      setTimeout(() => checkSite(newSite.id), 500);
    }

    await loadSites();
    renderSitesList();
    renderTagFilters();
    if (state.selectedSiteId === id) renderDetailPane();
  });

  // Settings Form Submit
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById('settings-api-key').value;
    const proxy = document.getElementById('settings-proxy').value.trim();

    const dialog = document.getElementById('settings-dialog');
    dialog.close();

    // Verify key
    if (apiKey) {
      const isValid = await geminiService.validateKey(apiKey);
      if (isValid) {
        geminiService.setApiKey(apiKey);
        showToast("Clé API Gemini enregistrée et validée !", 'success');
      } else {
        showToast("Clé API Gemini invalide ou expirée.", 'error');
      }
    } else {
      geminiService.setApiKey('');
      showToast("Clé API supprimée.", 'info');
    }

    // Save proxy
    localStorage.setItem('cors_proxy', proxy);
    showToast("Paramètres enregistrés.", 'success');
  });

  // Add Mock Site button inside settings
  document.getElementById('btn-add-mock-site').addEventListener('click', async () => {
    const mockSite = {
      id: 'site_mock_' + Date.now(),
      title: 'Mon Blog Tech (Démo)',
      url: 'https://blog.tech.com',
      selector: 'article',
      tag: 'Démo',
      status: 'up-to-date',
      lastChecked: null,
      lastChanged: null,
      lastSummary: '',
      lastTextContent: '',
      lastExtractedItems: [
        {
          title: "Sortie du Processeur Quantum v2 (Détails)",
          date: new Date().toLocaleDateString('fr-FR'),
          summary: "Lancement officiel de la v2 avec 40% de gain de puissance et support IA local.",
          timestamp: Date.now()
        },
        {
          title: "Rapport d'activité IA du mois dernier",
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
          summary: "Statistiques d'adoption de l'IA locale par les développeurs.",
          timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000
        },
        {
          title: "Conférence TechWorld 2026",
          date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
          summary: "Synthèse des annonces matérielles et logicielles pour l'année 2026.",
          timestamp: Date.now() - 45 * 24 * 60 * 60 * 1000
        },
        {
          title: "Archives : Lancement Quantum v1 (2025)",
          date: "12 Octobre 2025",
          summary: "Annonce initiale de l'architecture supraconductrice grand public.",
          timestamp: Date.now() - 250 * 24 * 60 * 60 * 1000
        }
      ]
    };
    await dbHelper.addSite(mockSite);
    localStorage.setItem('mock_step', '0');
    showToast("Site de démonstration ajouté.", 'success');
    
    document.getElementById('settings-dialog').close();
    
    await loadSites();
    renderSitesList();
    renderTagFilters();
    selectSite(mockSite.id);
  });

  // Clear Database button inside settings
  document.getElementById('btn-clear-db').addEventListener('click', async () => {
    if (confirm("Êtes-vous sûr de vouloir supprimer tous les sites surveillés et l'historique ? Cette action est irréversible.")) {
      await dbHelper.clearAllData();
      showToast("Base de données effacée.", 'info');
      document.getElementById('settings-dialog').close();
      state.selectedSiteId = null;
      await loadSites();
      renderSitesList();
      renderDetailPane();
      renderTagFilters();
    }
  });

  // Export Data
  document.getElementById('btn-export-data').addEventListener('click', () => {
    const exportStr = JSON.stringify(state.sites, null, 2);
    const blob = new Blob([exportStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `le-resumeur-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Données exportées avec succès.", 'success');
  });

  // Import Data
  document.getElementById('btn-import-data').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            for (let site of imported) {
              // Ensure basic properties exist
              if (site.id && site.title && site.url) {
                // Remove existing site if same ID to avoid conflicts, then add
                await dbHelper.deleteSite(site.id).catch(() => {});
                await dbHelper.addSite(site);
              }
            }
            showToast("Données importées avec succès !", 'success');
            await loadSites();
            renderSitesList();
            renderTagFilters();
          } else {
            showToast("Format de fichier d'importation invalide.", 'error');
          }
        } catch (err) {
          showToast("Erreur de lecture du fichier : " + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  // Copy custom summary to clipboard
  document.getElementById('btn-copy-custom-summary').addEventListener('click', () => {
    const text = document.getElementById('custom-summary-body').innerText;
    navigator.clipboard.writeText(text)
      .then(() => showToast("Résumé copié dans le presse-papiers !", "success"))
      .catch(() => showToast("Impossible de copier le texte.", "error"));
  });
}

// --- DIALOG FALLBACKS (Light Dismiss) ---
function setupDialogFallbacks() {
  document.querySelectorAll('dialog').forEach(dialog => {
    // If browser supports 'closedBy' property (declarative light dismiss), let it handle it
    if ('closedBy' in HTMLDialogElement.prototype) {
      dialog.setAttribute('closedby', 'any');
    } else {
      // Otherwise, register manual click checking backdrop dismiss
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;

        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );

        if (!isDialogContent) {
          dialog.close();
        }
      });
    }
  });
}

// --- HELPER FUNCTIONS ---
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
