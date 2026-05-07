const { app, BrowserWindow, ipcMain, dialog, globalShortcut, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const DATA_FILE = path.join(app.getPath('userData'), 'games.json');

function readGames() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function writeGames(games) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2), 'utf8');
}

let mainWin        = null;
let lastLaunchedId = null;
const runningGames = new Map(); // id → startTime

// ── Screenshot capture ─────────────────────────────────
async function captureScreen(gameId) {
  try {
    const primary = screen.getPrimaryDisplay();
    let { width, height } = primary.size;
    width = Math.min(width, 1280);
    height = Math.min(height, 720);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    if (!sources.length) return null;
    const dir = path.join(app.getPath('userData'), 'screenshots', gameId);
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, `shot_${Date.now()}.png`);
    fs.writeFileSync(filepath, sources[0].thumbnail.toPNG());
    const files = fs.readdirSync(dir).sort((a, b) => b.localeCompare(a));
    if (files.length > 20) {
      for (let i = 20; i < files.length; i++) {
        fs.unlinkSync(path.join(dir, files[i]));
      }
    }
    return filepath;
  } catch { return null; }
}

// ── Window ─────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1000, height: 700, minWidth: 800, minHeight: 500,
    backgroundColor: '#0d0d12', frame: false, titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      v8CodeCaching: true,
      enableRemoteModule: false,
    },
  });
  mainWin = win;
  win.webPreferences.nodeIntegration = false;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  ipcMain.handle('window-minimize', () => win.minimize());
  ipcMain.handle('window-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
  ipcMain.handle('window-close',    () => win.close());
}

// ── Games CRUD ─────────────────────────────────────────
ipcMain.handle('get-games', () => readGames());

ipcMain.handle('add-game', (_, data) => {
  const games = readGames();
  games.push({
    id: crypto.randomUUID(),
    name: data.name,
    genre: data.genre || null,
    exePath: data.exePath,
    exePaths: data.exePaths || [],
    imagePath: data.imagePath || null,
    note: '',
    playCount: 0,
    totalPlaytime: 0,
    sessions: [],
    lastPlayed: null,
    addedAt: new Date().toISOString(),
    status: null,
    favorite: false,
    rating: 0,
    tags: data.tags || [],
    goals: data.goals || [],
  });
  writeGames(games);
  return games;
});

ipcMain.handle('remove-game', (_, id) => {
  const games = readGames().filter(g => g.id !== id);
  writeGames(games);
  return games;
});

ipcMain.handle('edit-game', (_, data) => {
  const games = readGames();
  const g = games.find(x => x.id === data.id);
  if (!g) return games;
  if (data.name      !== undefined) g.name      = data.name;
  if (data.genre     !== undefined) g.genre     = data.genre;
  if (data.exePath   !== undefined) g.exePath   = data.exePath;
  if (data.exePaths  !== undefined) g.exePaths  = data.exePaths;
  if (data.imagePath !== undefined) g.imagePath = data.imagePath;
  if (data.tags      !== undefined) g.tags      = data.tags;
  if (data.rating    !== undefined) g.rating    = data.rating;
  if (data.goals     !== undefined) g.goals     = data.goals;
  writeGames(games);
  return games;
});

ipcMain.handle('update-game', (_, { id, field, value }) => {
  const games = readGames();
  const g = games.find(x => x.id === id);
  if (g) { g[field] = value; writeGames(games); }
  return games;
});

// ── Launch ─────────────────────────────────────────────
ipcMain.handle('launch-game', (_, id) => {
  const games = readGames();
  const game  = games.find(g => g.id === id);
  if (!game)                        return { error: 'Game not found' };
  if (!fs.existsSync(game.exePath)) return { error: 'Executable not found' };

  try {
    const startTime = Date.now();
    lastLaunchedId  = id;
    const proc = spawn(game.exePath, [], { detached: true, stdio: 'ignore' });
    proc.unref();

    game.playCount   = (game.playCount  || 0) + 1;
    game.lastPlayed  = new Date().toISOString();
    game.totalPlaytime = game.totalPlaytime || 0;
    writeGames(games);

    runningGames.set(id, startTime);
    if (mainWin && !mainWin.isDestroyed())
      mainWin.webContents.send('game-started', { id });

    proc.on('close', () => {
      runningGames.delete(id);
      if (mainWin && !mainWin.isDestroyed())
        mainWin.webContents.send('game-stopped', { id });

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const fresh = readGames();
      const g = fresh.find(x => x.id === id);
      if (g) {
        g.totalPlaytime = (g.totalPlaytime || 0) + elapsed;
        g.sessions = [...(g.sessions || []), {
          startedAt: new Date(startTime).toISOString(),
          duration: elapsed,
        }].slice(-50);
        writeGames(fresh);
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('playtime-update', { id, totalPlaytime: g.totalPlaytime });
          mainWin.webContents.send('session-update',  { id, sessions: g.sessions });
        }
      }
    });

    return { success: true, playCount: game.playCount };
  } catch (err) { return { error: err.message }; }
});

// ── Notes ──────────────────────────────────────────────
ipcMain.handle('save-note', (_, { id, note }) => {
  const games = readGames();
  const g = games.find(x => x.id === id);
  if (g) { g.note = note; writeGames(games); }
  return true;
});

// ── Screenshots ────────────────────────────────────────
ipcMain.handle('take-screenshot', async (_, gameId) => {
  const filepath = await captureScreen(gameId);
  return filepath ? { success: true, path: filepath } : { error: 'Capture failed' };
});

ipcMain.handle('get-screenshots', (_, id) => {
  const dir = path.join(app.getPath('userData'), 'screenshots', id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
    .map(f => path.join(dir, f))
    .sort((a, b) => b.localeCompare(a));
});

// ── Scan folder for games ──────────────────────────────
const SKIP_WORDS = ['uninstall','setup','install','update','helper','crash','report','redist','vcredist','directx','dotnet','vc_redist'];

ipcMain.handle('scan-folder', async () => {
  const r = await dialog.showOpenDialog({ title: 'Select games folder', properties: ['openDirectory'] });
  if (r.canceled) return null;
  const dir = r.filePaths[0];
  const results = [];

  function scan(d, depth) {
    if (depth > 3 || results.length >= 80) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= 80) return;
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scan(path.join(d, entry.name), depth + 1);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
          const lower = entry.name.toLowerCase();
          if (SKIP_WORDS.some(w => lower.includes(w))) continue;
          results.push({ name: path.basename(entry.name, '.exe'), path: path.join(d, entry.name) });
        }
      }
    } catch {}
  }

  scan(dir, 0);
  return results;
});

// ── Scan folder for cover images ───────────────────────
const IMAGE_EXTS = ['.jpg','.jpeg','.png','.gif','.webp'];

ipcMain.handle('scan-images', async () => {
  const r = await dialog.showOpenDialog({ title: 'Select folder with cover images', properties: ['openDirectory'] });
  if (r.canceled) return null;
  const dir = r.filePaths[0];
  const results = [];

  function scanImgs(d, depth) {
    if (depth > 2 || results.length >= 120) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= 120) return;
        if (entry.isDirectory() && !entry.name.startsWith('.') && depth < 2) {
          scanImgs(path.join(d, entry.name), depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTS.includes(ext)) {
            results.push({ name: path.basename(entry.name, ext), path: path.join(d, entry.name) });
          }
        }
      }
    } catch {}
  }

  scanImgs(dir, 0);
  return results;
});

// ── File dialogs ───────────────────────────────────────
ipcMain.handle('open-exe-dialog', async () => {
  const r = await dialog.showOpenDialog({ title: 'Select game executable', filters: [{ name: 'Executables', extensions: ['exe'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('open-image-dialog', async () => {
  const r = await dialog.showOpenDialog({ title: 'Select cover image', filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','gif','webp'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

// ── Steam import ──────────────────────────────────
function findMainExe(dir, depth) {
  if (depth > 2) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
        const lower = e.name.toLowerCase();
        if (!SKIP_WORDS.some(w => lower.includes(w))) return path.join(dir, e.name);
      }
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        const r = findMainExe(path.join(dir, e.name), depth + 1);
        if (r) return r;
      }
    }
  } catch {}
  return null;
}

ipcMain.handle('import-steam', async () => {
  const candidates = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(process.env.LOCALAPPDATA || '', 'Steam'),
    path.join(process.env.PROGRAMFILES || '', 'Steam'),
  ];
  let steamPath = candidates.find(p => fs.existsSync(p));
  if (!steamPath) return { error: 'Steam installation not found' };

  const libPaths = [path.join(steamPath, 'steamapps')];
  const vdfPath  = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (fs.existsSync(vdfPath)) {
    const vdf = fs.readFileSync(vdfPath, 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      const p = path.join(m[1], 'steamapps');
      if (fs.existsSync(p)) libPaths.push(p);
    }
  }

  const results = [];
  for (const steamapps of libPaths) {
    try {
      const acfFiles = fs.readdirSync(steamapps).filter(f => f.endsWith('.acf'));
      for (const acf of acfFiles) {
        try {
          const txt  = fs.readFileSync(path.join(steamapps, acf), 'utf8');
          const name = (txt.match(/"name"\s+"([^"]+)"/)||[])[1];
          const dir  = (txt.match(/"installdir"\s+"([^"]+)"/)||[])[1];
          if (!name || !dir) continue;
          const installDir = path.join(steamapps, 'common', dir);
          if (!fs.existsSync(installDir)) continue;
          const exe = findMainExe(installDir, 0);
          if (exe) results.push({ name, path: exe });
        } catch {}
      }
    } catch {}
  }
  return results;
});

// ── Data import ────────────────────────────────────
ipcMain.handle('import-data', (_, gamesData) => {
  try {
    writeGames(gamesData);
    return gamesData;
  } catch (e) { return { error: e.message }; }
});

// ── Running games query ────────────────────────────
ipcMain.handle('get-running-games', () => [...runningGames.keys()]);

// ── App lifecycle ──────────────────────────────────────
app.whenReady().then(() => {
  globalShortcut.register('F12', async () => {
    const id = lastLaunchedId;
    if (!id) return;
    const filepath = await captureScreen(id);
    if (filepath && mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('screenshot-taken', { gameId: id, path: filepath });
    }
  });
  createWindow();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
