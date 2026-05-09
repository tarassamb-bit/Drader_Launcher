const GENRES = [
  'Action','Adventure','RPG','Strategy','FPS','Battle Royale',
  'Racing','Sports','Puzzle','Simulation','Horror','Fighting',
  'Platformer','Open World','MOBA','Stealth','Indie','Survival',
  'Sandbox','Casual','MMO','Visual Novel',
];
const CHART_COLORS = ['#5b9cf6','#a855f7','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899'];
const ACCENT_PRESETS = ['#5b9cf6','#a855f7','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#ff7043','#64748b'];

const CARD_SIZES = {
  small:  { w: '130px', h: '172px' },
  medium: { w: '168px', h: '220px' },
  large:  { w: '212px', h: '280px' },
};

// ── Default Settings ──────────────────────────────────
const DEFAULT_SETTINGS = {
  accentColor:     '#5b9cf6',
  cardSize:        'medium',
  showPlaytime:    true,
  showGenreTags:   true,
  showJumpSection: true,
  defaultSort:     'recent',
  defaultView:     'grid',
  launchSound:     true,
  confirmRemove:   true,
  reduceAnimations: false,
};

// ── Settings load / save ──────────────────────────────
function loadSettings() {
  try {
    const raw = localStorage.getItem('draderSettings');
    if (!raw) return cloneDefaults();
    const saved = JSON.parse(raw);
    return { ...cloneDefaults(), ...saved };
  } catch { return cloneDefaults(); }
}

function cloneDefaults() {
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  localStorage.setItem('draderSettings', JSON.stringify(settings));
}

// ── State ─────────────────────────────────────────────
let settings           = loadSettings();
let games              = [];
let currentDetailId    = null;
let currentView        = 'library';
let currentSettingsSec = 'appearance';
let editingId          = null;
let viewMode           = settings.defaultView;
let selectedGenres     = [];
let searchQuery        = '';
let sortMode           = settings.defaultSort;
let noteTimer          = null;
let confirmCallback    = null;
let lightboxPaths      = [];
let lightboxIndex      = 0;
let runningGames       = new Set();
let extraExePaths      = [];   // for add/edit modal
let hoverTimer         = null;

// ── Elements ──────────────────────────────────────────
const gameGrid      = document.getElementById('game-grid');
const emptyState    = document.getElementById('empty-state');
const sidebarList   = document.getElementById('sidebar-list');
const modalOverlay  = document.getElementById('modal-overlay');
const launchOverlay = document.getElementById('launch-overlay');
const launchName    = document.getElementById('launch-name');
const inputName     = document.getElementById('input-name');
const inputExe      = document.getElementById('input-exe');
const inputImage    = document.getElementById('input-image');
const viewLibrary   = document.getElementById('view-library');
const viewDetail    = document.getElementById('view-detail');
const viewStats     = document.getElementById('view-stats');
const viewSettings  = document.getElementById('view-settings');
const mainNav       = document.getElementById('main-nav');
const libCount      = document.getElementById('lib-count');
const sidebarCount  = document.getElementById('sidebar-count');
const gridSearch    = document.getElementById('grid-search');
const searchClear   = document.getElementById('search-clear');
const notesArea     = document.getElementById('notes-area');
const toast         = document.getElementById('toast');
const jumpSection   = document.getElementById('jump-section');
const jumpRow       = document.getElementById('jump-row');
const lightbox      = document.getElementById('lightbox');
const lightboxImg   = document.getElementById('lightbox-img');

// ── Lazy image loading (low-memory optimization) ──────
const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
        imgObserver.unobserve(img);
      }
    }
  });
}, { rootMargin: '50px' });

// ── Apply settings to UI ──────────────────────────────
function applySettings() {
  applyAccent(settings.accentColor);
  applyCardSize(settings.cardSize);
  applyAnimationSetting(settings.reduceAnimations);
  // Initialise sort/view buttons
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === sortMode));
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === viewMode));
}

function applyAccent(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) hex = '#5b9cf6';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const lighten = (v,a) => Math.min(255, Math.round(v + (255-v)*a));
  const lighter = '#' + [r,g,b].map(v => lighten(v,.2).toString(16).padStart(2,'0')).join('');
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-h', lighter);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},.22)`);
  settings.accentColor = hex;
}

function applyCardSize(size) {
  const s = CARD_SIZES[size] || CARD_SIZES.medium;
  document.documentElement.style.setProperty('--card-w', s.w);
  document.documentElement.style.setProperty('--card-cover-h', s.h);
  settings.cardSize = size;
}

function applyAnimationSetting(reduce) {
  document.documentElement.classList.toggle('reduce-animations', reduce);
  settings.reduceAnimations = reduce;
}

// ── Hex color helper ──────────────────────────────────
function hexToRgba(hex, alpha) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(104,104,160,${alpha})`;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Titlebar ──────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.api.windowMinimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.windowMaximize());
document.getElementById('btn-close').addEventListener('click',    () => window.api.windowClose());

// ── Sidebar collapse ──────────────────────────────────
(function() {
  const sidebar    = document.querySelector('.sidebar');
  const toggleBtn  = document.getElementById('sidebar-toggle-btn');
  const closeBtn   = document.getElementById('sidebar-close-btn');
  let collapsed    = localStorage.getItem('draderSidebarCollapsed') === 'true';

  function applySidebar() {
    sidebar.classList.toggle('collapsed', collapsed);
    toggleBtn.classList.toggle('active', collapsed);
    toggleBtn.title = collapsed ? 'Show game list' : 'Hide game list';
  }

  applySidebar();

  toggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    localStorage.setItem('draderSidebarCollapsed', collapsed);
    applySidebar();
  });

  closeBtn.addEventListener('click', () => {
    collapsed = true;
    localStorage.setItem('draderSidebarCollapsed', collapsed);
    applySidebar();
  });
})();

// ── Detail panel resizer ──────────────────────────────
(function() {
  const resizer    = document.getElementById('detail-resizer');
  const detailLeft = document.getElementById('detail-left');
  if (!resizer || !detailLeft) return;

  // Restore saved width
  const savedW = localStorage.getItem('draderDetailLeftWidth');
  if (savedW) detailLeft.style.width = savedW;

  let dragging = false, startX = 0, startW = 0;

  resizer.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = detailLeft.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor      = 'col-resize';
    document.body.style.userSelect  = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta  = e.clientX - startX;
    const newW   = Math.max(200, Math.min(600, startW + delta));
    detailLeft.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    localStorage.setItem('draderDetailLeftWidth', detailLeft.style.width);
  });
})();

// ── Toast ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type='') {
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ── Confirm dialog ────────────────────────────────────
function confirmAction(msg, onConfirm) {
  document.getElementById('confirm-msg').innerHTML = msg;
  confirmCallback = onConfirm;
  document.getElementById('confirm-overlay').classList.add('open');
}
document.getElementById('confirm-ok').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.remove('open');
  confirmCallback = null;
});

// ── Launch sound ──────────────────────────────────────
function playLaunchSound() {
  if (!settings.launchSound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    [[220,330,0],[330,660,.07]].forEach(([f1,f2,delay]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(f1, t+delay);
      osc.frequency.exponentialRampToValueAtTime(f2, t+delay+.18);
      gain.gain.setValueAtTime(0, t+delay);
      gain.gain.linearRampToValueAtTime(.18, t+delay+.04);
      gain.gain.exponentialRampToValueAtTime(.001, t+delay+.34);
      osc.start(t+delay); osc.stop(t+delay+.35);
    });
  } catch {}
}

// ── Keyboard shortcuts ────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'n' && currentDetailId) {
    e.preventDefault(); notesArea.focus(); notesArea.scrollIntoView({ behavior:'smooth' });
  }
  if (e.key === 'Escape') {
    closeLightbox();
    document.getElementById('confirm-overlay').classList.remove('open');
    document.getElementById('scan-overlay').classList.remove('open');
    document.getElementById('cover-scan-overlay').classList.remove('open');
  }
  if (lightbox.classList.contains('open')) {
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'ArrowLeft')  lightboxNav(-1);
  }
});

// ── Genre picker ──────────────────────────────────────
const genrePicker = document.getElementById('genre-picker');
GENRES.forEach(g => {
  const chip = document.createElement('button');
  chip.type = 'button'; chip.className = 'genre-chip';
  chip.textContent = g; chip.dataset.genre = g;
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    selectedGenres = [...genrePicker.querySelectorAll('.genre-chip.active')].map(c => c.dataset.genre);
  });
  genrePicker.appendChild(chip);
});
function resetGenrePicker() {
  selectedGenres = [];
  genrePicker.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
}
function setGenrePickerValue(genreStr) {
  resetGenrePicker();
  const arr = parseGenres(genreStr);
  genrePicker.querySelectorAll('.genre-chip').forEach(c => {
    if (arr.includes(c.dataset.genre)) { c.classList.add('active'); selectedGenres.push(c.dataset.genre); }
  });
}

// ── Main nav ──────────────────────────────────────────
mainNav.addEventListener('click', e => {
  const tab = e.target.closest('.nav-tab');
  if (!tab) return;
  const v = tab.dataset.view;
  switchView(v);
});

document.getElementById('settings-nav-btn').addEventListener('click', () => {
  switchView('settings');
});

function switchView(v) {
  if (v === currentView) return;

  // Deactivate all nav controls
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('settings-nav-btn').classList.remove('active');

  // Hide all views
  viewLibrary.classList.add('hidden');
  viewStats.classList.add('hidden');
  viewSettings.classList.add('hidden');
  viewDetail.classList.add('hidden');
  mainNav.classList.remove('hidden');
  currentDetailId = null;
  currentView = v;

  if (v === 'library') {
    document.querySelector('.nav-tab[data-view="library"]').classList.add('active');
    viewLibrary.classList.remove('hidden');
    renderGames();
  } else if (v === 'stats') {
    document.querySelector('.nav-tab[data-view="stats"]').classList.add('active');
    viewStats.classList.remove('hidden');
    renderStats();
  } else if (v === 'settings') {
    document.getElementById('settings-nav-btn').classList.add('active');
    viewSettings.classList.remove('hidden');
    renderSettingsSection(currentSettingsSec);
  }
  renderSidebar();
}

// ── View toggle (grid / list) ─────────────────────────
document.getElementById('view-toggle').addEventListener('click', e => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  viewMode = btn.dataset.mode;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === viewMode));
  renderGrid();
});

// ── Sort ──────────────────────────────────────────────
document.getElementById('sort-btns').addEventListener('click', e => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sortMode = btn.dataset.sort;
  renderGrid();
});

// ── Search ────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim().toLowerCase(); renderSidebar();
});
gridSearch.addEventListener('input', () => {
  searchClear.classList.toggle('visible', gridSearch.value.length > 0); renderGrid();
});
searchClear.addEventListener('click', () => {
  gridSearch.value = ''; searchClear.classList.remove('visible'); gridSearch.focus(); renderGrid();
});

// ── Notes autosave ────────────────────────────────────
notesArea.addEventListener('input', () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => {
    if (!currentDetailId) return;
    await window.api.saveNote(currentDetailId, notesArea.value);
    showToast('Note saved', 'success');
  }, 800);
});

function displayScanResults(results) {
  const overlay = document.createElement('div');
  overlay.id = 'scan-overlay';
  overlay.className = 'scan-overlay';
  overlay.innerHTML = `
    <div class="scan-modal">
      <div class="scan-header">
        <h3>Found ${results.length} Game(s)</h3>
        <button class="scan-close" onclick="document.getElementById('scan-overlay').remove()">✕</button>
      </div>
      <div class="scan-list">
        ${results.map((r, i) => `
          <div class="scan-item">
            <div class="scan-info">
              <div class="scan-name">${escHtml(r.name)}</div>
              <div class="scan-path">${escHtml(r.path)}</div>
            </div>
            <button class="scan-btn" onclick="addScannedGame(${i})">Add</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function addScannedGame(index) {
  const result = lastScanResults[index];
  if (!result) return;
  window.api.addGame({
    name: result.name,
    exePath: result.path,
  }).then(() => {
    showToast(`Added ${result.name}!`, 'success');
    document.getElementById('scan-overlay')?.remove();
    loadGames();
  });
}

// ── Drag-and-drop cover image ─────────────────────────
const dropZone = document.getElementById('cover-drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave',()=> dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && /\.(jpe?g|png|gif|webp)$/i.test(file.name)) inputImage.value = file.path || '';
});

// ── Add / Edit Modal ──────────────────────────────────
function openModal(id = null) {
  editingId = id;
  const game = id ? games.find(g => g.id === id) : null;
  document.getElementById('modal-title').textContent = id ? 'Edit Game' : 'Add Game';
  document.getElementById('ok-btn').textContent      = id ? 'Save Changes' : 'Add Game';
  inputName.value  = game?.name  || '';
  inputExe.value   = game?.exePath || '';
  inputImage.value = game?.imagePath || '';
  document.getElementById('input-tags').value = (game?.tags||[]).join(', ');
  setGenrePickerValue(game?.genre || '');
  extraExePaths = (game?.exePaths || []).map(x => ({...x}));
  renderExtraExeList();
  modalOverlay.classList.add('open');
  inputName.focus();
}
function closeModal() { modalOverlay.classList.remove('open'); editingId = null; extraExePaths = []; }

function renderExtraExeList() {
  const container = document.getElementById('extra-exe-list');
  if (!container) return;
  container.innerHTML = extraExePaths.map((ep, i) =>
    `<div class="extra-exe-item">
      <div class="extra-exe-label" title="${escHtml(ep.path)}">${escHtml(ep.label||ep.path)}</div>
      <button class="extra-exe-del" data-i="${i}" title="Remove">×</button>
    </div>`
  ).join('');
  container.querySelectorAll('.extra-exe-del').forEach(btn =>
    btn.addEventListener('click', () => { extraExePaths.splice(+btn.dataset.i,1); renderExtraExeList(); })
  );
}

document.getElementById('add-extra-exe').addEventListener('click', async () => {
  const p = await window.api.openExeDialog();
  if (!p) return;
  const label = p.split(/[\\/]/).pop().replace(/\.exe$/i,'');
  extraExePaths.push({ label, path: p });
  renderExtraExeList();
});

document.getElementById('add-btn').addEventListener('click', () => openModal());
document.getElementById('add-btn-sidebar').addEventListener('click', () => openModal());
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('cancel-btn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.getElementById('browse-exe').addEventListener('click', async () => {
  const p = await window.api.openExeDialog(); if (p) inputExe.value = p;
});
document.getElementById('browse-image').addEventListener('click', async () => {
  const p = await window.api.openImageDialog(); if (p) inputImage.value = p;
});

document.getElementById('ok-btn').addEventListener('click', async () => {
  const name = inputName.value.trim(), exePath = inputExe.value.trim();
  inputName.style.borderColor = !name    ? 'var(--danger)' : '';
  inputExe.style.borderColor  = !exePath ? 'var(--danger)' : '';
  if (!name || !exePath) return;
  inputName.style.borderColor = inputExe.style.borderColor = '';
  const genre     = selectedGenres.join(', ') || null;
  const imagePath = inputImage.value.trim() || null;
  const tags      = document.getElementById('input-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const exePaths  = extraExePaths;

  if (editingId) {
    games = await window.api.editGame({ id: editingId, name, genre, exePath, exePaths, imagePath, tags });
    if (currentDetailId === editingId) {
      const g = games.find(x => x.id === editingId);
      if (g) {
        document.getElementById('detail-title').textContent = g.name;
        if (g.imagePath) {
          document.getElementById('banner-img').src = 'file://'+g.imagePath.replace(/\\/g,'/');
          document.getElementById('detail-cover').src = 'file://'+g.imagePath.replace(/\\/g,'/');
        }
        const row = document.getElementById('detail-genre-row');
        row.innerHTML = '';
        parseGenres(g.genre).forEach(t => {
          const s = document.createElement('span'); s.className = 'genre-tag'; s.textContent = t; row.appendChild(s);
        });
        renderDetailTags(g);
      }
    }
    showToast('Game updated', 'success');
  } else {
    games = await window.api.addGame({ name, genre, exePath, exePaths, imagePath, tags });
  }
  closeModal(); renderGames();
});
inputName.addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('ok-btn').click(); });

// ── Edit button in play bar ───────────────────────────
document.getElementById('btn-edit').addEventListener('click', () => {
  if (currentDetailId) openModal(currentDetailId);
});

// ── Scan folder (called from settings) ───────────────
async function triggerScanFolder() {
  showToast('Scanning folder...');
  const results = await window.api.scanFolder();
  if (!results) return;
  openScanModal(results);
}

async function triggerScanImages() {
  showToast('Scanning for images...');
  const results = await window.api.scanImages();
  if (!results) return;
  openCoverScanModal(results);
}

async function triggerSteamImport() {
  showToast('Scanning Steam library...');
  const results = await window.api.importSteam();
  if (results.error) { showToast('Steam not found on this machine', 'error'); return; }
  if (!results.length) { showToast('No Steam games found'); return; }
  openScanModal(results);
}

function openScanModal(results) {
  const list = document.getElementById('scan-list');
  const hint = document.getElementById('scan-hint');
  const existing = new Set(games.map(g => g.exePath));
  const fresh = results.filter(r => !existing.has(r.path));
  hint.textContent = `Found ${fresh.length} new game${fresh.length!==1?'s':''} (${results.length-fresh.length} already in library).`;
  if (!fresh.length) {
    list.innerHTML = '<div class="scan-empty">No new games found in that folder.</div>';
  } else {
    list.innerHTML = fresh.map((r,i) => `
      <div class="scan-item">
        <input type="checkbox" class="scan-check" data-idx="${i}" checked />
        <input type="text" class="scan-name" data-idx="${i}" value="${escHtml(r.name)}" />
        <span class="scan-path" title="${escHtml(r.path)}">${escHtml(r.path)}</span>
      </div>`).join('');
    list._results = fresh;
  }
  document.getElementById('scan-overlay').classList.add('open');
}

// ── Cover image scan modal ────────────────────────────
function openCoverScanModal(results) {
  const list    = document.getElementById('cover-scan-list');
  const hint    = document.getElementById('cover-scan-hint');
  const noCover = games.filter(g => !g.imagePath);

  if (!results.length) {
    hint.textContent = 'No image files found in that folder.';
    list.innerHTML   = '';
    document.getElementById('cover-scan-overlay').classList.add('open');
    return;
  }

  hint.textContent = `Found ${results.length} image${results.length!==1?'s':''}. Assign each to a game below.`;

  list.innerHTML = results.map((img, i) => {
    const src = 'file://' + img.path.replace(/\\/g, '/');
    const opts = [
      `<option value="">— skip —</option>`,
      ...noCover.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`),
      ...games.filter(g => g.imagePath).map(g => `<option value="${g.id}" class="has-cover">${escHtml(g.name)} ✓</option>`),
    ].join('');
    return `
      <div class="cover-scan-item">
        <img class="cover-scan-thumb" src="${src}" alt="" onerror="this.className='cover-scan-thumb-ph';this.innerHTML='&#128444;'" />
        <div class="cover-scan-info">
          <div class="cover-scan-name" title="${escHtml(img.path)}">${escHtml(img.name)}</div>
          <select class="cover-scan-select" data-img="${escHtml(img.path)}">${opts}</select>
        </div>
      </div>`;
  }).join('');

  // Auto-match by name similarity
  results.forEach((img, i) => {
    const sel = list.querySelectorAll('.cover-scan-select')[i];
    const lower = img.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = games.find(g => {
      const gn = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return gn === lower || gn.startsWith(lower) || lower.startsWith(gn);
    });
    if (match) sel.value = match.id;
  });

  document.getElementById('cover-scan-overlay').classList.add('open');
}

document.getElementById('cover-scan-close').addEventListener('click',  () => document.getElementById('cover-scan-overlay').classList.remove('open'));
document.getElementById('cover-scan-cancel').addEventListener('click', () => document.getElementById('cover-scan-overlay').classList.remove('open'));
document.getElementById('cover-scan-apply').addEventListener('click', async () => {
  const selects = document.getElementById('cover-scan-list').querySelectorAll('.cover-scan-select');
  let applied = 0;
  for (const sel of selects) {
    if (!sel.value) continue;
    games = await window.api.editGame({ id: sel.value, imagePath: sel.dataset.img });
    applied++;
  }
  document.getElementById('cover-scan-overlay').classList.remove('open');
  renderGames();
  showToast(`Applied ${applied} cover${applied!==1?'s':''}`, 'success');
});

document.getElementById('scan-close').addEventListener('click',  () => document.getElementById('scan-overlay').classList.remove('open'));
document.getElementById('scan-cancel').addEventListener('click', () => document.getElementById('scan-overlay').classList.remove('open'));
document.getElementById('scan-add').addEventListener('click', async () => {
  const list = document.getElementById('scan-list');
  if (!list._results) return;
  const checks = list.querySelectorAll('.scan-check:checked');
  for (const cb of checks) {
    const idx = +cb.dataset.idx;
    const name = list.querySelector(`.scan-name[data-idx="${idx}"]`).value.trim() || list._results[idx].name;
    games = await window.api.addGame({ name, genre: null, exePath: list._results[idx].path, imagePath: null });
  }
  document.getElementById('scan-overlay').classList.remove('open');
  renderGames();
  showToast(`Added ${checks.length} game${checks.length!==1?'s':''}`, 'success');
});


// ── Favorite toggle ───────────────────────────────────
document.getElementById('btn-favorite').addEventListener('click', async () => {
  if (!currentDetailId) return;
  const g = games.find(x => x.id === currentDetailId);
  if (!g) return;
  const newFav = !g.favorite;
  games = await window.api.updateGame(currentDetailId, 'favorite', newFav);
  const updated = games.find(x => x.id === currentDetailId);
  if (updated) updateFavBtn(updated);
  renderGrid(); renderSidebar();
  showToast(newFav ? '⭐ Added to favorites' : 'Removed from favorites');
});

function updateFavBtn(game) {
  const btn = document.getElementById('btn-favorite');
  btn.classList.toggle('on', !!game.favorite);
  btn.title = game.favorite ? 'Remove from Favorites' : 'Add to Favorites';
}

// ── Sort helpers ──────────────────────────────────────
function sortedGames(list, mode) {
  const fav  = list.filter(g => g.favorite);
  const rest = list.filter(g => !g.favorite);
  function sortArr(arr) {
    if (mode==='alpha')    return arr.sort((a,b) => a.name.localeCompare(b.name));
    if (mode==='playtime') return arr.sort((a,b) => (b.totalPlaytime||0)-(a.totalPlaytime||0));
    if (mode==='recent')   return arr.sort((a,b) => {
      if (!a.lastPlayed && !b.lastPlayed) return a.name.localeCompare(b.name);
      if (!a.lastPlayed) return 1; if (!b.lastPlayed) return -1;
      return new Date(b.lastPlayed)-new Date(a.lastPlayed);
    });
    if (mode==='genre') return arr.sort((a,b) => {
      const ga=primaryGenre(a.genre),gb=primaryGenre(b.genre);
      return ga!==gb ? ga.localeCompare(gb) : a.name.localeCompare(b.name);
    });
    return arr;
  }
  return [...sortArr([...fav]), ...sortArr([...rest])];
}
function primaryGenre(str) { const g=parseGenres(str); return g.length?g[0]:'Other'; }

function applyFilters(list) {
  const q = gridSearch.value.trim().toLowerCase();
  let out = q ? list.filter(g => g.name.toLowerCase().includes(q)) : list;
  if (selectedGenres.length) out = out.filter(g => selectedGenres.some(gen => (g.genre||'').includes(gen)));
  return out;
}

// ── Jump Back In ──────────────────────────────────────
function renderJumpBackIn() {
  if (!settings.showJumpSection) { jumpSection.style.display = 'none'; return; }
  const recent = sortedGames(games, 'recent').filter(g => g.lastPlayed).slice(0, 6);
  if (!recent.length) { jumpSection.style.display = 'none'; return; }
  jumpSection.style.display = '';
  jumpRow.innerHTML = '';
  recent.forEach((game, i) => {
    const card = document.createElement('div');
    card.className = 'jump-card ' + (i === 0 ? 'jump-card-featured' : 'jump-card-small');
    const src = game.imagePath ? 'file://'+game.imagePath.replace(/\\/g,'/') : '';
    const bg = src ? `background-image:url('${src.replace(/'/g,"\\'")}')` : '';
    card.innerHTML = `
      <div class="jump-card-bg" style="${bg}"></div>
      <div class="jump-card-overlay"></div>
      <div class="jump-card-content">
        <div class="jump-card-name">${escHtml(game.name)}</div>
        <div class="jump-card-meta">${formatPlaytimeLong(game.totalPlaytime||0)} &middot; ${timeAgo(new Date(game.lastPlayed))}</div>
      </div>
      <button class="jump-play-btn" title="Play">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>`;
    card.querySelector('.jump-play-btn').addEventListener('click', e => { e.stopPropagation(); launchGame(game.id); });
    card.addEventListener('click', () => showDetail(game.id));
    jumpRow.appendChild(card);
  });
}

// ── Sidebar ───────────────────────────────────────────
function renderSidebar() {
  sidebarList.innerHTML = '';
  const q = searchQuery;
  const list = [...games].sort((a,b) => a.name.localeCompare(b.name)).filter(g => !q || g.name.toLowerCase().includes(q));
  sidebarCount.textContent = `Games (${games.length})`;
  list.forEach(game => {
    const li = document.createElement('li');
    li.className = 'sidebar-item' + (currentDetailId===game.id ? ' active' : '');
    const src = game.imagePath ? 'file://'+game.imagePath.replace(/\\/g,'/') : '';
    const th = src
      ? `<div class="sidebar-thumb"><img src="${src}" alt="" onerror="this.outerHTML='<div class=\\'sidebar-thumb-ph\\'>${escHtml(game.name[0])}</div>'"></div>`
      : `<div class="sidebar-thumb"><div class="sidebar-thumb-ph">${escHtml(game.name[0])}</div></div>`;
    li.innerHTML = `${th}<span class="sidebar-name">${escHtml(game.name)}</span>`;
    li.addEventListener('click', () => showDetail(game.id));
    sidebarList.appendChild(li);
  });
}

// ── Grid / List ───────────────────────────────────────
function renderGrid() {
  const oldList = document.querySelector('.game-list');
  if (oldList) oldList.remove();

  const sorted = sortedGames(applyFilters(games), sortMode);
  const q      = gridSearch.value.trim().toLowerCase();

  libCount.textContent = q
    ? `${sorted.length} of ${games.length} game${games.length!==1?'s':''}`
    : `All Games (${games.length})`;

  if (viewMode === 'list') {
    renderListView(sorted);
    gameGrid.style.display = 'none';
    return;
  }
  gameGrid.style.display = '';
  gameGrid.innerHTML = '';

  if (!games.length) { gameGrid.appendChild(emptyState); return; }
  if (!sorted.length) {
    const el = document.createElement('div'); el.className = 'empty-state';
    el.innerHTML = `<div class="empty-icon">&#128270;</div><p>No results</p>`;
    gameGrid.appendChild(el); return;
  }

  if (sortMode === 'genre') {
    const groups = {};
    sorted.forEach(g => { const k=primaryGenre(g.genre); (groups[k]=groups[k]||[]).push(g); });
    Object.keys(groups).sort().forEach(genre => {
      const h = document.createElement('div'); h.className='genre-header'; h.textContent=genre;
      gameGrid.appendChild(h);
      groups[genre].forEach(g => gameGrid.appendChild(makeCard(g)));
    });
  } else {
    sorted.forEach(g => gameGrid.appendChild(makeCard(g)));
  }
  gameGrid.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
}

function renderListView(sorted) {
  gameGrid.style.display = 'none';
  const container = document.createElement('div');
  container.className = 'game-list';

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128270;</div><p>No results</p></div>';
    gameGrid.parentElement.insertBefore(container, gameGrid.nextSibling);
    return;
  }

  if (sortMode === 'genre') {
    const groups = {};
    sorted.forEach(g => { const k=primaryGenre(g.genre); (groups[k]=groups[k]||[]).push(g); });
    Object.keys(groups).sort().forEach(genre => {
      const h = document.createElement('div'); h.className='list-genre-header'; h.textContent=genre;
      container.appendChild(h);
      groups[genre].forEach(g => container.appendChild(makeListItem(g)));
    });
  } else {
    sorted.forEach(g => container.appendChild(makeListItem(g)));
  }
  gameGrid.parentElement.insertBefore(container, gameGrid.nextSibling);
  container.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
}

function makeCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card'; card.dataset.id = game.id;
  const src = game.imagePath ? 'file://'+game.imagePath.replace(/\\/g,'/') : '';
  const coverHtml = src
    ? `<img class="card-cover" data-src="${src}" alt="${escHtml(game.name)}" onerror="this.outerHTML='<div class=\\'card-cover-ph\\'>&#9654;</div>'">`
    : `<div class="card-cover-ph">&#9654;</div>`;

  const genreTagsHtml = settings.showGenreTags
    ? parseGenres(game.genre).slice(0,2).map(g=>`<span class="card-genre-tag">${escHtml(g)}</span>`).join('')
    : '';

  const timeHtml = settings.showPlaytime
    ? `<div class="card-time" data-id="${game.id}">${formatPlaytime(game.totalPlaytime||0)}</div>`
    : '';

  const favClass = game.favorite ? 'card-fav on' : 'card-fav';

  card.innerHTML = `
    ${coverHtml}
    <div class="card-play"><div class="card-play-icon">&#9654;</div></div>
    <button class="${favClass}" title="Favorite">★</button>
    <div class="card-info">
      <div class="card-name">${escHtml(game.name)}</div>
      ${timeHtml}
      ${genreTagsHtml ? `<div class="card-genres">${genreTagsHtml}</div>` : ''}
    </div>`;

  card.querySelector('.card-fav').addEventListener('click', async e => {
    e.stopPropagation();
    const newFav = !game.favorite;
    games = await window.api.updateGame(game.id, 'favorite', newFav);
    renderGames();
    if (currentDetailId === game.id) {
      const g = games.find(x => x.id === game.id);
      if (g) updateFavBtn(g);
    }
  });
  card.addEventListener('click', () => showDetail(game.id));

  // Running dot
  if (runningGames.has(game.id)) {
    const dot = document.createElement('div'); dot.className = 'card-running-dot';
    card.appendChild(dot);
  }

  // Hover preview
  card.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showCardPreview(game, card.getBoundingClientRect()), 450);
  });
  card.addEventListener('mouseleave', hideCardPreview);

  return card;
}

function makeListItem(game) {
  const li = document.createElement('div');
  li.className = 'list-item'; li.dataset.id = game.id;
  const src = game.imagePath ? 'file://'+game.imagePath.replace(/\\/g,'/') : '';
  const thumb = src
    ? `<div class="list-thumb"><img data-src="${src}" alt="" onerror="this.style.display='none'"></div>`
    : `<div class="list-thumb"><div class="list-thumb-ph">&#9654;</div></div>`;

  const genre = primaryGenre(game.genre) !== 'Other' ? primaryGenre(game.genre) : (parseGenres(game.genre)[0]||'');

  const runDot = runningGames.has(game.id) ? `<div class="list-running-dot" title="Running"></div>` : '';
  li.innerHTML = `
    ${runDot}
    ${thumb}
    <span class="list-fav ${game.favorite?'on':''}">★</span>
    <div class="list-name">${escHtml(game.name)}</div>
    <div class="list-genre">${escHtml(genre)}</div>
    <div class="list-time">${formatPlaytimeLong(game.totalPlaytime||0)}</div>
    <div class="list-last">${game.lastPlayed ? timeAgo(new Date(game.lastPlayed)) : '—'}</div>
    <button class="list-play-btn" title="Play">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </button>`;
  li.querySelector('.list-play-btn').addEventListener('click', e => { e.stopPropagation(); launchGame(game.id); });
  li.addEventListener('click', () => showDetail(game.id));
  return li;
}

function renderGames() { renderJumpBackIn(); renderSidebar(); renderGrid(); }

// ── Views ─────────────────────────────────────────────
function showLibrary() {
  viewDetail.classList.add('hidden');
  viewStats.classList.add('hidden');
  viewSettings.classList.add('hidden');
  viewLibrary.classList.remove('hidden');
  mainNav.classList.remove('hidden');
  currentDetailId = null;
  currentView = 'library';
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view==='library'));
  document.getElementById('settings-nav-btn').classList.remove('active');
  renderSidebar();
}

async function showDetail(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;
  currentDetailId = id;

  const bannerImg = document.getElementById('banner-img');
  const bgBlur    = document.getElementById('detail-bg-blur');

  if (game.imagePath) {
    const src = 'file://'+game.imagePath.replace(/\\/g,'/');
    bannerImg.src = src; bannerImg.classList.remove('hidden');
    bgBlur.style.backgroundImage = `url('${src.replace(/'/g,"\\'")}')`;
    bgBlur.classList.add('visible');

    // Gradient header color extraction
    const tmp = new Image(); tmp.crossOrigin = 'anonymous';
    tmp.onload = () => {
      extractDominantColor(tmp, col => {
        if (!col) return;
        let overlay = document.getElementById('banner-color-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'banner-color-overlay';
          overlay.className = 'banner-color-overlay';
          document.getElementById('game-banner').prepend(overlay);
        }
        overlay.style.background = `linear-gradient(135deg, ${col}88 0%, transparent 60%)`;
        overlay.classList.add('visible');
      });
    };
    tmp.src = src;
  } else {
    bannerImg.src=''; bannerImg.classList.add('hidden');
    bgBlur.style.backgroundImage = ''; bgBlur.classList.remove('visible');
    const overlay = document.getElementById('banner-color-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  const coverEl = document.getElementById('detail-cover'), phEl = document.getElementById('detail-cover-ph');
  if (game.imagePath) { coverEl.src='file://'+game.imagePath.replace(/\\/g,'/'); coverEl.classList.remove('hidden'); phEl.classList.add('hidden'); }
  else { coverEl.classList.add('hidden'); phEl.classList.remove('hidden'); }

  const genreRow = document.getElementById('detail-genre-row');
  genreRow.innerHTML = '';
  parseGenres(game.genre).forEach(tag => {
    const s = document.createElement('span'); s.className='genre-tag'; s.textContent=tag; genreRow.appendChild(s);
  });
  document.getElementById('detail-title').textContent = game.name;

  renderDetailRating(game);
  renderDetailTags(game);
  renderGoals(game);
  updatePlayBar(game);
  updateFavBtn(game);
  showRunningBadge(runningGames.has(id));
  renderActivity(game.sessions||[]);
  renderGameChart(game);
  notesArea.value = game.note || '';
  renderSidebar();

  viewLibrary.classList.add('hidden');
  viewStats.classList.add('hidden');
  viewSettings.classList.add('hidden');
  mainNav.classList.add('hidden');
  viewDetail.classList.remove('hidden');
}

// ── Rating ────────────────────────────────────────────
function renderDetailRating(game) {
  const el = document.getElementById('detail-rating');
  if (!el) return;
  const r = game.rating || 0;
  el.innerHTML = [1,2,3,4,5].map(n =>
    `<button class="star ${n<=r?'on':''}" data-r="${n}" title="${n} star${n>1?'s':''}">★</button>`
  ).join('');
  el.querySelectorAll('.star').forEach(btn => {
    btn.addEventListener('mouseenter', () => el.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('on', i<+btn.dataset.r)));
    btn.addEventListener('mouseleave', () => el.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('on', i<r)));
    btn.addEventListener('click', async () => {
      const newR = +btn.dataset.r === r ? 0 : +btn.dataset.r;
      games = await window.api.editGame({ id: currentDetailId, rating: newR });
      const g = games.find(x=>x.id===currentDetailId);
      if (g) renderDetailRating(g);
    });
  });
}

// ── Tags ──────────────────────────────────────────────
function renderDetailTags(game) {
  const row = document.getElementById('detail-tags-row');
  if (!row) return;
  const tags = game.tags || [];
  row.innerHTML = tags.map((t,i) =>
    `<span class="detail-tag">${escHtml(t)}<button class="detail-tag-x" data-i="${i}" title="Remove">×</button></span>`
  ).join('') +
  `<button class="add-tag-chip" id="add-tag-chip">+ tag</button>`;

  row.querySelectorAll('.detail-tag-x').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const newTags = [...tags]; newTags.splice(+btn.dataset.i, 1);
      games = await window.api.editGame({ id: currentDetailId, tags: newTags });
      const g = games.find(x=>x.id===currentDetailId); if(g) renderDetailTags(g);
    });
  });

  const addChip = document.getElementById('add-tag-chip');
  addChip.addEventListener('click', () => {
    addChip.outerHTML = `<div class="tag-input-wrap"><input class="tag-input" id="tag-inline-input" placeholder="tag name" maxlength="20"/><button class="goal-save-btn" id="tag-inline-ok" style="padding:4px 9px;font-size:11px">OK</button></div>`;
    const inp = document.getElementById('tag-inline-input');
    inp.focus();
    const save = async () => {
      const v = inp.value.trim();
      if (!v) { renderDetailTags(game); return; }
      const newTags = [...tags, v];
      games = await window.api.editGame({ id: currentDetailId, tags: newTags });
      const g = games.find(x=>x.id===currentDetailId); if(g) renderDetailTags(g);
    };
    document.getElementById('tag-inline-ok').addEventListener('click', save);
    inp.addEventListener('keydown', e => { if(e.key==='Enter') save(); if(e.key==='Escape') renderDetailTags(game); });
  });
}

// ── Goals ─────────────────────────────────────────────
function renderGoals(game) {
  const list = document.getElementById('goals-list');
  if (!list) return;
  const goals = game.goals || [];

  if (!goals.length) {
    list.innerHTML = '<div class="goals-empty">No goals yet. Click + to add one.</div>';
  } else {
    const done = goals.filter(g=>g.completed).length;
    const pct  = Math.round(done/goals.length*100);
    list.innerHTML =
      `<div class="goals-progress"><div class="goals-progress-bar" style="width:${pct}%"></div></div>` +
      goals.map((g,i) => `
        <div class="goal-item">
          <input type="checkbox" class="goal-cb" data-i="${i}" ${g.completed?'checked':''}/>
          <span class="goal-label${g.completed?' done':''}">${escHtml(g.title)}</span>
          <button class="goal-del" data-i="${i}" title="Delete">×</button>
        </div>`).join('');

    list.querySelectorAll('.goal-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const newGoals = game.goals.map((g,i) => i===+cb.dataset.i ? {...g, completed:cb.checked} : g);
        games = await window.api.editGame({ id: currentDetailId, goals: newGoals });
        const upd = games.find(x=>x.id===currentDetailId); if(upd) { upd.goals=newGoals; renderGoals(upd); }
      });
    });
    list.querySelectorAll('.goal-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newGoals = game.goals.filter((_,i) => i!==+btn.dataset.i);
        games = await window.api.editGame({ id: currentDetailId, goals: newGoals });
        const upd = games.find(x=>x.id===currentDetailId); if(upd) { upd.goals=newGoals; renderGoals(upd); }
      });
    });
  }
}

// Add-goal row wiring (done once after DOM ready, but elements are in HTML)
document.getElementById('add-goal-btn').addEventListener('click', () => {
  const row = document.getElementById('add-goal-row');
  row.classList.toggle('hidden');
  if (!row.classList.contains('hidden')) document.getElementById('new-goal-input').focus();
});
document.getElementById('goal-save-btn').addEventListener('click', saveNewGoal);
document.getElementById('new-goal-input').addEventListener('keydown', e => { if(e.key==='Enter') saveNewGoal(); });

async function saveNewGoal() {
  const inp   = document.getElementById('new-goal-input');
  const title = inp.value.trim();
  if (!title || !currentDetailId) return;
  const game = games.find(x=>x.id===currentDetailId);
  if (!game) return;
  const newGoals = [...(game.goals||[]), { id: Date.now()+'', title, completed: false }];
  games = await window.api.editGame({ id: currentDetailId, goals: newGoals });
  const upd = games.find(x=>x.id===currentDetailId);
  if (upd) { upd.goals = newGoals; renderGoals(upd); }
  inp.value = '';
  document.getElementById('add-goal-row').classList.add('hidden');
}

function updatePlayBar(game) {
  document.getElementById('pb-last').textContent     = game.lastPlayed ? timeAgo(new Date(game.lastPlayed)) : '—';
  document.getElementById('pb-time').textContent     = formatPlaytimeLong(game.totalPlaytime||0);
  document.getElementById('pb-sessions').textContent = game.playCount||0;
}

function renderActivity(sessions) {
  const list = document.getElementById('activity-list');
  list.innerHTML = '';
  if (!sessions.length) { list.innerHTML='<div class="activity-empty">No sessions yet.</div>'; return; }
  [...sessions].reverse().slice(0,10).forEach(s => {
    const el = document.createElement('div'); el.className='activity-item';
    const d = new Date(s.startedAt);
    el.innerHTML = `<div class="activity-date">${d.toLocaleDateString()} &nbsp;${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      <div class="activity-duration">${formatPlaytimeLong(s.duration)}</div>`;
    list.appendChild(el);
  });
}

// ── Per-game chart ────────────────────────────────────
function renderGameChart(game) {
  const wrap = document.getElementById('game-chart-wrap');
  if (!wrap) return;
  const sessions = game.sessions || [];
  if (!sessions.length) {
    wrap.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:6px 0">No sessions yet.</div>';
    return;
  }
  const now = Date.now(), COUNT = 30;
  const dayVals = {};
  for (let i=COUNT-1; i>=0; i--) {
    dayVals[new Date(now-i*86400000).toISOString().slice(0,10)] = 0;
  }
  sessions.forEach(s => { const k=s.startedAt.slice(0,10); if(dayVals[k]!==undefined) dayVals[k]+=s.duration; });
  const vals = Object.values(dayVals);
  const maxV  = Math.max(...vals, 60) / 3600;
  const W=300, H=58, PL=4, PR=4, PT=4, PB=4;
  const cW=W-PL-PR, cH=H-PT-PB, step=cW/(vals.length-1);
  const pts = vals.map((v,i) => [+(PL+i*step).toFixed(1), +(PT+cH-(v/3600/maxV)*cH).toFixed(1)]);
  const line = pts.map((p,i) => (i===0?'M':'L')+p[0]+' '+p[1]).join(' ');
  const area = line+` L${pts[pts.length-1][0]} ${H-PB} L${PL} ${H-PB} Z`;
  const dots = pts.map((p,i) => vals[i]>0 ? `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="var(--accent)"/>` : '').join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:58px;overflow:visible">
    <defs><linearGradient id="gcg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#gcg)"/>
    <path d="${line}" stroke="var(--accent)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

// ── Lightbox ──────────────────────────────────────────
function openLightbox(idx) {
  lightboxIndex = idx;
  lightboxImg.src = 'file://'+lightboxPaths[idx].replace(/\\/g,'/');
  document.getElementById('lightbox-counter').textContent = `${idx+1} / ${lightboxPaths.length}`;
  document.getElementById('lightbox-prev').style.display = lightboxPaths.length > 1 ? '' : 'none';
  document.getElementById('lightbox-next').style.display = lightboxPaths.length > 1 ? '' : 'none';
  lightbox.classList.add('open');
}
function closeLightbox() { lightbox.classList.remove('open'); }
function lightboxNav(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxPaths.length) % lightboxPaths.length;
  openLightbox(lightboxIndex);
}

document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.getElementById('lightbox-prev').addEventListener('click', e => { e.stopPropagation(); lightboxNav(-1); });
document.getElementById('lightbox-next').addEventListener('click', e => { e.stopPropagation(); lightboxNav(1); });

document.getElementById('back-btn').addEventListener('click', showLibrary);

// ── Launch ────────────────────────────────────────────
async function launchGame(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;
  launchName.textContent = game.name;
  launchOverlay.classList.add('active');
  playLaunchSound();
  const result = await window.api.launchGame(id);
  setTimeout(() => {
    launchOverlay.classList.remove('active');
    if (result.error) { alert('Failed to launch: '+result.error); return; }
    const g = games.find(g => g.id === id);
    if (g) { g.playCount=result.playCount; g.lastPlayed=new Date().toISOString(); }
    if (currentDetailId===id && g) updatePlayBar(g);
    renderGames();
  }, 2000);
}
document.getElementById('play-btn').addEventListener('click', () => { if (currentDetailId) launchGame(currentDetailId); });

// ── Remove ────────────────────────────────────────────
async function removeGame(id) {
  games = await window.api.removeGame(id);
  if (currentDetailId===id) showLibrary();
  renderGames();
}
document.getElementById('remove-detail-btn').addEventListener('click', () => {
  if (!currentDetailId) return;
  const game = games.find(g => g.id === currentDetailId);
  if (settings.confirmRemove) {
    confirmAction(`Remove <strong>${escHtml(game?.name||'this game')}</strong> from your library?`, () => removeGame(currentDetailId));
  } else {
    removeGame(currentDetailId);
  }
});

// ── Events from main ──────────────────────────────────
window.api.onPlaytimeUpdate(({ id, totalPlaytime }) => {
  const g = games.find(x => x.id === id);
  if (g) g.totalPlaytime = totalPlaytime;
  const el = document.querySelector(`.card-time[data-id="${id}"]`);
  if (el) el.textContent = formatPlaytime(totalPlaytime);
  if (currentDetailId===id && g) { updatePlayBar(g); renderGameChart(g); }
  renderJumpBackIn();
});
window.api.onSessionUpdate(({ id, sessions }) => {
  const g = games.find(x => x.id === id);
  if (g) g.sessions = sessions;
  if (currentDetailId===id) { renderActivity(sessions); if(g) renderGameChart(g); }
});
window.api.onGameStarted(({ id }) => {
  runningGames.add(id);
  updateRunningIndicators(id);
  if (currentDetailId === id) showRunningBadge(true);
});
window.api.onGameStopped(({ id }) => {
  runningGames.delete(id);
  updateRunningIndicators(id);
  if (currentDetailId === id) showRunningBadge(false);
});

function updateRunningIndicators(id) {
  // Update card dot
  const card = document.querySelector(`.game-card[data-id="${id}"]`);
  if (card) {
    const dot = card.querySelector('.card-running-dot');
    if (runningGames.has(id) && !dot) {
      const d = document.createElement('div'); d.className = 'card-running-dot';
      card.appendChild(d);
    } else if (!runningGames.has(id) && dot) {
      dot.remove();
    }
  }
  // Update list row dot
  const li = document.querySelector(`.list-item[data-id="${id}"]`);
  if (li) {
    const dot = li.querySelector('.list-running-dot');
    if (runningGames.has(id) && !dot) {
      const d = document.createElement('div'); d.className = 'list-running-dot';
      li.insertBefore(d, li.firstChild);
    } else if (!runningGames.has(id) && dot) {
      dot.remove();
    }
  }
}

function showRunningBadge(running) {
  const badge = document.getElementById('running-badge');
  if (badge) badge.classList.toggle('hidden', !running);
}

// ── Card hover preview ────────────────────────────────
const cardPreview = document.getElementById('card-preview');

function showCardPreview(game, rect) {
  const cpCover  = document.getElementById('cp-cover');
  const cpCoverPh= document.getElementById('cp-cover-ph');
  const cpName   = document.getElementById('cp-name');
  const cpRating = document.getElementById('cp-rating');
  const cpTime   = document.getElementById('cp-time');

  if (game.imagePath) {
    cpCover.src = 'file://'+game.imagePath.replace(/\\/g,'/');
    cpCover.classList.remove('hidden'); cpCoverPh.classList.add('hidden');
  } else {
    cpCover.src=''; cpCover.classList.add('hidden'); cpCoverPh.classList.remove('hidden');
  }
  cpName.textContent   = game.name;
  cpRating.textContent = game.rating ? '★'.repeat(game.rating) + '☆'.repeat(5-game.rating) : '☆☆☆☆☆';
  cpTime.textContent   = formatPlaytimeLong(game.totalPlaytime||0);

  // Position: right of card if space, else left
  const pw = 220;
  let left = rect.right + 8;
  if (left + pw > window.innerWidth) left = rect.left - pw - 8;
  let top  = rect.top + (rect.height - 144) / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - 152));

  cardPreview.style.left = left + 'px';
  cardPreview.style.top  = top  + 'px';
  cardPreview.classList.add('visible');
}

function hideCardPreview() {
  clearTimeout(hoverTimer);
  cardPreview.classList.remove('visible');
}

// ── Dominant color extraction for gradient header ─────
function extractDominantColor(imgEl, callback) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let r=0,g=0,b=0,cnt=0;
    for (let i=0; i<d.length; i+=16) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; cnt++; }
    callback(`rgb(${Math.round(r/cnt)},${Math.round(g/cnt)},${Math.round(b/cnt)})`);
  } catch { callback(null); }
}

// ══ STATS ════════════════════════════════════════════
function calcStreak() {
  const days = new Set();
  games.forEach(g => (g.sessions||[]).forEach(s => days.add(s.startedAt.slice(0,10))));
  if (!days.size) return 0;
  const sorted = [...days].sort();
  const today     = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const last = sorted[sorted.length-1];
  if (last!==today && last!==yesterday) return 0;
  let streak = 1;
  for (let i=sorted.length-2; i>=0; i--) {
    const diff = (new Date(sorted[i+1])-new Date(sorted[i]))/86400000;
    if (diff===1) streak++; else break;
  }
  return streak;
}

function renderStats() {
  const now=Date.now(), oneWeek=7*24*3600*1000;
  const totalSecs = games.reduce((s,g)=>s+(g.totalPlaytime||0),0);
  let weekSecs=0;
  games.forEach(g=>(g.sessions||[]).forEach(s=>{ if(new Date(s.startedAt).getTime()>now-oneWeek) weekSecs+=s.duration; }));
  let longestSecs=0, longestDate=null;
  games.forEach(g=>(g.sessions||[]).forEach(s=>{ if(s.duration>longestSecs){longestSecs=s.duration;longestDate=s.startedAt;} }));
  const totalSessions = games.reduce((s,g)=>s+(g.sessions||[]).length,0);
  const gamesPlayed   = games.filter(g=>g.playCount>0).length;
  const streak        = calcStreak();

  document.getElementById('stat-total-time').textContent  = totalSecs>0 ? formatPlaytimeLong(totalSecs) : '0h';
  document.getElementById('stat-week-time').textContent   = weekSecs>60 ? '+'+formatPlaytimeLong(weekSecs)+' this week' : '';
  document.getElementById('stat-games').textContent       = games.length;
  document.getElementById('stat-played-count').textContent= gamesPlayed>0 ? gamesPlayed+' played' : '';
  document.getElementById('stat-longest').textContent     = longestSecs>0 ? formatPlaytimeLong(longestSecs) : '—';
  document.getElementById('stat-longest-date').textContent= longestDate ? new Date(longestDate).toLocaleDateString([],{month:'short',day:'numeric'}) : '';
  document.getElementById('stat-sessions').textContent    = totalSessions;
  document.getElementById('stat-streak').textContent      = streak>0 ? `🔥 ${streak} day streak` : '';

  renderPlaytimeChart();
  renderTopGames();
  renderStatsRecent();
}

function renderPlaytimeChart() {
  const wrap=document.getElementById('chart-svg-wrap'), labelsEl=document.getElementById('chart-labels-x');
  if(!wrap) return;
  const now=Date.now(), COUNT=14, dayKeys=[], dayVals={};
  for(let i=COUNT-1;i>=0;i--) {
    const d=new Date(now-i*86400000), k=d.toISOString().slice(0,10);
    dayKeys.push({key:k,label:d.toLocaleDateString([],{month:'short',day:'numeric'})});
    dayVals[k]=0;
  }
  games.forEach(g=>(g.sessions||[]).forEach(s=>{const k=s.startedAt.slice(0,10);if(dayVals[k]!==undefined)dayVals[k]+=s.duration;}));
  const vals=dayKeys.map(d=>dayVals[d.key]/3600), maxV=Math.max(...vals,.5);
  const W=600,H=135,PL=6,PR=6,PT=12,PB=6,cW=W-PL-PR,cH=H-PT-PB,step=cW/(vals.length-1);
  const pts=vals.map((v,i)=>[+(PL+i*step).toFixed(1),+(PT+cH-(v/maxV)*cH).toFixed(1)]);
  const line=pts.map((p,i)=>(i===0?'M':'L')+p[0]+' '+p[1]).join(' ');
  const area=line+` L${pts[pts.length-1][0]} ${H-PB} L${PL} ${H-PB} Z`;
  const dots=pts.map((p,i)=>vals[i]>0?`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--accent)" stroke="var(--bg2)" stroke-width="1.5"/>`:'').join('');
  const gridLines=[.25,.5,.75,1].map(f=>{
    const y=(PT+cH-f*cH).toFixed(1);
    return `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
            <text x="${PL}" y="${+y-4}" font-size="8" fill="var(--dim)">${(maxV*f).toFixed(1)}h</text>`;
  }).join('');
  wrap.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;overflow:visible">
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${gridLines}
    <path d="${area}" fill="url(#cg)"/>
    <path d="${line}" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
  if(labelsEl) labelsEl.innerHTML=dayKeys.map((d,i)=>`<span style="opacity:${i===0||i===6||i===13?1:0}">${d.label}</span>`).join('');
}

function renderTopGames() {
  const el=document.getElementById('top-games-list'); if(!el) return;
  const top=[...games].sort((a,b)=>(b.totalPlaytime||0)-(a.totalPlaytime||0)).slice(0,5);
  if(!top.length){el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px 0">No games yet</div>';return;}
  const maxT=top[0].totalPlaytime||1;
  el.innerHTML=top.map((g,i)=>`<div class="top-game-item">
    <div class="top-game-rank">${i+1}</div>
    <div class="top-game-info">
      <div class="top-game-name">${escHtml(g.name)}</div>
      <div class="top-game-bar-wrap"><div class="top-game-bar" style="width:${((g.totalPlaytime||0)/maxT*100).toFixed(1)}%"></div></div>
    </div>
    <div class="top-game-time">${formatPlaytimeLong(g.totalPlaytime||0)}</div>
  </div>`).join('');
}

function renderStatsRecent() {
  const el=document.getElementById('stats-recent-list'); if(!el) return;
  const recent=sortedGames(games,'recent').filter(g=>g.lastPlayed).slice(0,5);
  if(!recent.length){el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px 0">No games played yet</div>';return;}
  el.innerHTML=recent.map(g=>{
    const src=g.imagePath?'file://'+g.imagePath.replace(/\\/g,'/'):'';
    const cover=src?`<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'">`
      :`<div class="stats-recent-cover-ph">&#9654;</div>`;
    return `<div class="stats-recent-item" data-id="${g.id}">
      <div class="stats-recent-cover">${cover}</div>
      <div class="stats-recent-info">
        <div class="stats-recent-name">${escHtml(g.name)}</div>
        <div class="stats-recent-meta">${formatPlaytimeLong(g.totalPlaytime||0)} &middot; ${timeAgo(new Date(g.lastPlayed))}</div>
      </div>
      <div class="stats-recent-sessions">${(g.sessions||[]).length} sessions</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.stats-recent-item').forEach(item=>item.addEventListener('click',()=>showDetail(item.dataset.id)));
}

// ══ SETTINGS ═════════════════════════════════════════
function renderSettingsSection(section) {
  currentSettingsSec = section;
  document.querySelectorAll('.ss-item').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  const content = document.getElementById('settings-content');
  switch (section) {
    case 'appearance': content.innerHTML = buildAppearanceSection(); break;
    case 'library':    content.innerHTML = buildLibrarySection();    break;
    case 'general':    content.innerHTML = buildGeneralSection();    break;
    case 'data':       content.innerHTML = buildDataSection();       break;
    case 'about':      content.innerHTML = buildAboutSection();      break;
  }
  bindSettingsSectionEvents(section);
}

// Click handler for settings sidebar items
document.getElementById('view-settings').addEventListener('click', e => {
  const item = e.target.closest('.ss-item');
  if (item) renderSettingsSection(item.dataset.section);
});

// ── Settings section builders ─────────────────────────

function buildToggleRow(key, label, desc, checked) {
  return `
    <div class="sg-row">
      <div class="sg-row-info">
        <div class="sg-row-label">${label}</div>
        ${desc ? `<div class="sg-row-desc">${desc}</div>` : ''}
      </div>
      <div class="sg-row-ctrl">
        <label class="toggle-wrap">
          <input type="checkbox" class="toggle-input settings-toggle" data-key="${key}" ${checked?'checked':''} />
          <div class="toggle-track"></div>
        </label>
      </div>
    </div>
  `;
}

function buildAppearanceSection() {
  const acc = settings.accentColor;
  return `
    <div class="sc-header">
      <div class="sc-title">Appearance</div>
      <div class="sc-desc">Customize the look and feel of your library.</div>
    </div>

    <div class="sg">
      <div class="sg-title">Accent Color</div>
      <div class="sg-row">
        <div class="sg-row-info">
          <div class="sg-row-label">Theme color</div>
          <div class="sg-row-desc">Used for buttons, highlights, and active states.</div>
        </div>
        <div class="sg-row-ctrl">
          <div class="accent-grid">
            ${ACCENT_PRESETS.map(c => `<button class="accent-swatch ${acc===c?'active':''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
            <label title="Custom color" style="display:flex;align-items:center">
              <input type="color" class="hidden-color-input" id="accent-custom-input" value="${acc}" />
              <button class="accent-swatch" id="accent-custom-btn" style="background:${!ACCENT_PRESETS.includes(acc)?acc:'#2a2a40'};font-size:13px;display:flex;align-items:center;justify-content:center" onclick="document.getElementById('accent-custom-input').click()">✎</button>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="sg">
      <div class="sg-title">Card Size</div>
      <div class="sg-row">
        <div class="sg-row-info">
          <div class="sg-row-label">Game card size</div>
          <div class="sg-row-desc">Choose how large game cards appear in the grid.</div>
        </div>
        <div class="sg-row-ctrl">
          <div class="card-size-group">
            ${['small','medium','large'].map(sz => {
              const dims = CARD_SIZES[sz];
              const pw = sz==='small' ? 32 : sz==='medium' ? 42 : 54;
              const ph = sz==='small' ? 42 : sz==='medium' ? 56 : 72;
              return `<button class="card-size-opt ${settings.cardSize===sz?'active':''}" data-size="${sz}" title="${sz}">
                <div class="card-size-preview" style="width:${pw}px;height:${ph}px"></div>
                <span class="card-size-label">${sz.charAt(0).toUpperCase()+sz.slice(1)}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="sg">
      <div class="sg-title">Library Display</div>
      ${buildToggleRow('showPlaytime',    'Show playtime on cards',     'Display hours played on each game card.', settings.showPlaytime)}
      ${buildToggleRow('showGenreTags',   'Show genre tags on cards',   'Show genre chips below the game title.', settings.showGenreTags)}
      ${buildToggleRow('showJumpSection', 'Show "Jump back in" section','Display recently played games at the top of the library.', settings.showJumpSection)}
    </div>
  `;
}

function buildLibrarySection() {
  const sorts = [['recent','Last Played'],['alpha','A–Z'],['playtime','Playtime'],['genre','Genre']];
  const noCoverCount = games.filter(g => !g.imagePath).length;
  return `
    <div class="sc-header">
      <div class="sc-title">Library</div>
      <div class="sc-desc">Default behavior when you open the app.</div>
    </div>

    <div class="sg">
      <div class="sg-title">Defaults</div>
      <div class="sg-row">
        <div class="sg-row-info">
          <div class="sg-row-label">Default sort order</div>
          <div class="sg-row-desc">How games are sorted when you open the library.</div>
        </div>
        <div class="sg-row-ctrl">
          <select class="sg-select" data-key="defaultSort">
            ${sorts.map(([v,l]) => `<option value="${v}" ${settings.defaultSort===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="sg-row">
        <div class="sg-row-info">
          <div class="sg-row-label">Default view mode</div>
          <div class="sg-row-desc">Grid or list layout on startup.</div>
        </div>
        <div class="sg-row-ctrl">
          <div class="sg-seg">
            <button class="sg-seg-btn ${settings.defaultView==='grid'?'active':''}" data-key="defaultView" data-value="grid">Grid</button>
            <button class="sg-seg-btn ${settings.defaultView==='list'?'active':''}" data-key="defaultView" data-value="list">List</button>
          </div>
        </div>
      </div>
    </div>

    <div class="sg">
      <div class="sg-title">Import</div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Scan folder for games</div>
          <div class="data-action-desc">Find .exe files in a folder and add them to your library.</div>
        </div>
        <button class="sec-btn" id="settings-scan-games-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px;vertical-align:middle"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          Scan for Games
        </button>
      </div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Scan folder for cover images</div>
          <div class="data-action-desc">Find images and assign them to games as cover art.${noCoverCount > 0 ? ` <strong>${noCoverCount} game${noCoverCount!==1?'s':''}</strong> without a cover.` : ' All games have covers ✓'}</div>
        </div>
        <button class="sec-btn" id="settings-scan-images-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px;vertical-align:middle"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Scan for Covers
        </button>
      </div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Import from Steam</div>
          <div class="data-action-desc">Automatically detect your Steam library and import installed games.</div>
        </div>
        <button class="sec-btn" id="settings-steam-import-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Import Steam Games
        </button>
      </div>
    </div>
  `;
}

function buildGeneralSection() {
  return `
    <div class="sc-header">
      <div class="sc-title">General</div>
      <div class="sc-desc">App-wide behavior settings.</div>
    </div>

    <div class="sg">
      <div class="sg-title">Behaviour</div>
      ${buildToggleRow('launchSound',    'Play sound on launch',         'A short sound plays when you launch a game.', settings.launchSound)}
      ${buildToggleRow('confirmRemove',  'Confirm before removing games', 'Show a confirmation dialog before deleting a game from your library.', settings.confirmRemove)}
    </div>

    <div class="sg">
      <div class="sg-title">Performance</div>
      ${buildToggleRow('reduceAnimations', 'Reduce animations', 'Disable animations and transitions for better performance on low-end machines.', settings.reduceAnimations)}
    </div>
  `;
}

function buildDataSection() {
  return `
    <div class="sc-header">
      <div class="sc-title">Data</div>
      <div class="sc-desc">Manage your library data and storage.</div>
    </div>

    <div class="sg">
      <div class="sg-title">Storage</div>
      <div class="data-path-row">
        <div class="data-path-label">Library data</div>
        <div class="data-path-val">%APPDATA%\\Drader\\games.json</div>
      </div>
    </div>

    <div class="sg">
      <div class="sg-title">Backup &amp; Restore</div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Export library</div>
          <div class="data-action-desc">Save a JSON backup of all your games, playtime, goals, tags and sessions.</div>
        </div>
        <button class="sec-btn" id="export-data-btn">Export JSON</button>
      </div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Import library</div>
          <div class="data-action-desc">Restore a previously exported JSON backup. <strong>This will replace your current library.</strong></div>
        </div>
        <button class="sec-btn" id="import-data-btn">Import JSON</button>
      </div>
      <input type="file" id="import-file-input" accept=".json" style="display:none"/>
    </div>

    <div class="sg">
      <div class="sg-title">Actions</div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Reset settings</div>
          <div class="data-action-desc">Restore all settings to their defaults.</div>
        </div>
        <button class="sec-btn" id="reset-settings-btn">Reset Defaults</button>
      </div>
      <div class="data-action-row">
        <div class="data-action-info">
          <div class="data-action-label">Clear library</div>
          <div class="data-action-desc">Permanently delete all games from your library. This cannot be undone.</div>
        </div>
        <button class="sec-btn danger" id="clear-data-btn">Clear All Games</button>
      </div>
    </div>
  `;
}

function buildAboutSection() {
  const totalTime  = games.reduce((s,g)=>s+(g.totalPlaytime||0),0);
  const totalSess  = games.reduce((s,g)=>s+(g.sessions||[]).length,0);
  const favCount   = games.filter(g=>g.favorite).length;
  const streak     = calcStreak();
  const played     = games.filter(g=>g.playCount>0).length;
  const topGame    = games.length > 0 ? games.reduce((a,b)=>(b.totalPlaytime||0)>(a.totalPlaytime||0)?b:a) : null;

  return `
    <div class="about-container">
      <div class="about-header-premium">
        <div class="about-logo-big">▶</div>
        <h1>Drader</h1>
        <p>Game Library Manager</p>
        <span class="about-version">v1.0.0</span>
      </div>

      <div class="about-stats-grid">
        <div class="stat-item stat-item-primary">
          <div class="stat-num">${games.length}</div>
          <div class="stat-name">Games</div>
          <div class="stat-bar" style="width:${Math.min(games.length*5,100)}%"></div>
        </div>
        <div class="stat-item stat-item-success">
          <div class="stat-num">${formatPlaytimeLong(totalTime)}</div>
          <div class="stat-name">Total Playtime</div>
          <div class="stat-bar" style="width:${Math.min(totalTime/3600,100)}%"></div>
        </div>
        <div class="stat-item stat-item-info">
          <div class="stat-num">${totalSess}</div>
          <div class="stat-name">Sessions</div>
          <div class="stat-bar" style="width:${Math.min(totalSess*2,100)}%"></div>
        </div>
        <div class="stat-item stat-item-gold">
          <div class="stat-num">${played}</div>
          <div class="stat-name">Games Played</div>
          <div class="stat-bar" style="width:${Math.min(played*10,100)}%"></div>
        </div>
        <div class="stat-item stat-item-accent">
          <div class="stat-num">⭐ ${favCount}</div>
          <div class="stat-name">Favorites</div>
          <div class="stat-bar" style="width:${Math.min(favCount*10,100)}%"></div>
        </div>
        <div class="stat-item stat-item-fire">
          <div class="stat-num">${streak>0?'🔥'+streak:'-'}</div>
          <div class="stat-name">${streak>0?'Day Streak':'Keep Playing'}</div>
          <div class="stat-bar" style="width:${Math.min(streak*10,100)}%"></div>
        </div>
      </div>

      ${topGame ? `
        <div class="about-highlight">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Most Played Game</div>
          <div style="font-size:18px;font-weight:600;color:var(--accent)">${escHtml(topGame.name)}</div>
          <div style="font-size:13px;color:var(--dim);margin-top:4px">${formatPlaytimeLong(topGame.totalPlaytime||0)} played</div>
        </div>
      ` : ''}

      <div class="about-features">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Features</div>
        <div style="display:grid;gap:8px">
          <div class="feature-tag">📊 Advanced Statistics</div>
          <div class="feature-tag">🎮 Game Library Management</div>
          <div class="feature-tag">🔍 PC Game Discovery</div>
          <div class="feature-tag">🎨 Dark Theme Optimized</div>
        </div>
      </div>

      <div class="about-footer">
        <p style="font-size:12px;color:var(--dim);margin:12px 0">Built with Electron & Vanilla JavaScript</p>
        <p style="font-size:11px;color:var(--muted)">Optimized for gaming performance</p>
      </div>
    </div>
  `;
}

// ── Settings section event binding ────────────────────
function bindSettingsSectionEvents(section) {
  const content = document.getElementById('settings-content');

  // Toggle switches (appearance + general)
  content.querySelectorAll('.settings-toggle').forEach(input => {
    input.addEventListener('change', () => {
      settings[input.dataset.key] = input.checked;
      if (input.dataset.key === 'reduceAnimations') {
        applyAnimationSetting(input.checked);
      }
      saveSettings();
      renderGames(); // re-render to reflect display changes
    });
  });

  if (section === 'appearance') {
    // Accent swatches
    content.querySelectorAll('.accent-swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyAccent(btn.dataset.color);
        saveSettings();
        content.querySelectorAll('.accent-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === settings.accentColor));
      });
    });

    // Custom color picker
    const customInput = document.getElementById('accent-custom-input');
    if (customInput) {
      customInput.addEventListener('input', () => {
        applyAccent(customInput.value);
        saveSettings();
        content.querySelectorAll('.accent-swatch[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === customInput.value));
      });
    }

    // Card size buttons
    content.querySelectorAll('.card-size-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        applyCardSize(btn.dataset.size);
        saveSettings();
        content.querySelectorAll('.card-size-opt').forEach(b => b.classList.toggle('active', b.dataset.size === settings.cardSize));
      });
    });
  }

  if (section === 'library') {
    // Sort select
    const sortSel = content.querySelector('.sg-select[data-key="defaultSort"]');
    if (sortSel) sortSel.addEventListener('change', () => {
      settings.defaultSort = sortSel.value;
      saveSettings();
    });

    // View segmented buttons
    content.querySelectorAll('.sg-seg-btn[data-key="defaultView"]').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.defaultView = btn.dataset.value;
        saveSettings();
        content.querySelectorAll('.sg-seg-btn[data-key="defaultView"]').forEach(b => b.classList.toggle('active', b.dataset.value === settings.defaultView));
      });
    });

    // Scan buttons
    const scanGamesBtn = document.getElementById('settings-scan-games-btn');
    if (scanGamesBtn) scanGamesBtn.addEventListener('click', triggerScanFolder);

    const scanImagesBtn = document.getElementById('settings-scan-images-btn');
    if (scanImagesBtn) scanImagesBtn.addEventListener('click', triggerScanImages);

    // Steam import
    const steamBtn = document.getElementById('settings-steam-import-btn');
    if (steamBtn) steamBtn.addEventListener('click', triggerSteamImport);
  }

  if (section === 'data') {
    // Export
    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = JSON.stringify(games, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `drader-library-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Library exported!', 'success');
      });
    }

    // Import
    const importBtn  = document.getElementById('import-data-btn');
    const importFile = document.getElementById('import-file-input');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', () => {
        const file = importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async e => {
          try {
            const parsed = JSON.parse(e.target.result);
            if (!Array.isArray(parsed)) throw new Error('Invalid format');
            confirmAction(`Import ${parsed.length} games? <strong>Your current library will be replaced.</strong>`, async () => {
              games = await window.api.importData(parsed);
              renderGames();
              showToast(`Imported ${games.length} games`, 'success');
              renderSettingsSection('about');
            });
          } catch (err) { showToast('Import failed: invalid JSON', 'error'); }
        };
        reader.readAsText(file);
        importFile.value = '';
      });
    }

    // Reset settings
    const resetBtn = document.getElementById('reset-settings-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        confirmAction('Reset all settings to their defaults?', () => {
          settings = cloneDefaults();
          saveSettings();
          applySettings();
          renderSettingsSection('appearance');
          showToast('Settings reset to defaults', 'success');
        });
      });
    }

    // Clear all games
    const clearBtn = document.getElementById('clear-data-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        confirmAction(`<strong>Delete all ${games.length} games</strong> from your library? This cannot be undone.`, async () => {
          for (const g of [...games]) {
            await window.api.removeGame(g.id);
          }
          games = [];
          renderGames();
          showToast('Library cleared', 'success');
          renderSettingsSection('about'); // refresh stats
        });
      });
    }
  }
}

// ── Helpers ───────────────────────────────────────────
function parseGenres(str) { if(!str) return []; return str.split(',').map(s=>s.trim()).filter(Boolean); }
function formatPlaytime(s) {
  if(!s||s<60) return s>0?'< 1m played':'0m played';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
  return h===0?`${m}m played`:m>0?`${h}h ${m}m played`:`${h}h played`;
}
function formatPlaytimeLong(s) {
  if(!s||s<60) return '< 1 min';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
  return h===0?`${m} min`:m>0?`${h}h ${m}m`:`${h}h`;
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function timeAgo(date) {
  const diff=Date.now()-date.getTime(),m=Math.floor(diff/60000);
  if(m<1) return 'just now'; if(m<60) return m+'m ago';
  const h=Math.floor(m/60); if(h<24) return h+'h ago';
  const d=Math.floor(h/24); if(d<7) return d+'d ago';
  return date.toLocaleDateString([],{month:'short',day:'numeric'});
}

// ── Init ──────────────────────────────────────────────
(async () => {
  applySettings();
  games = await window.api.getGames();
  // Sync any games that were running before window reloaded
  const running = await window.api.getRunningGames();
  running.forEach(id => runningGames.add(id));
  renderGames();
})();
