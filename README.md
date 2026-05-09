<div align="center">

# 🎮 Drader Launcher

**A sleek, open-source game launcher built with Electron.**  
Your personal gaming hub — like Steam, but yours.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-30-47848F?style=flat-square&logo=electron)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/version-2.0.0-orange?style=flat-square)

</div>

---

## ✨ Features

- 🗂️ **Game Library** — Add any game by pointing to its `.exe`. Grid or list view.
- 🚀 **One-click Launch** — Launch games directly from the app with play tracking.
- ⏱️ **Playtime Tracking** — Tracks total hours played and session history per game.
- 🖼️ **Cover Art** — Assign custom cover images to each game.
- 📝 **Notes & Goals** — Write personal notes and set goals for each game.
- 🏷️ **Tags & Genres** — Organize games with genres and custom tags.
- ⭐ **Favorites & Ratings** — Star your favorites and rate your games.
- 📊 **Stats View** — Visual charts of your gaming habits with playtime tracking and top games.
- 🔍 **Search & Filter** — Instantly search and filter by status, genre, or tag.
- 🎨 **Themes & Accent Colors** — Customize the look with accent color presets.
- 🔄 **Steam Import** — Auto-detect and import installed Steam games.
- 📁 **Folder Scan** — Scan a folder to bulk-add games.
- 💾 **Sidebar** — Collapsible game list sidebar with close button.
- 🪟 **Frameless Window** — Custom titlebar with minimize/maximize/close.

---

## 📸 Preview

> Dark, minimal UI — built for gamers who want control.

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Desktop Shell | [Electron 30](https://www.electronjs.org/) |
| UI | Vanilla JS + HTML + CSS (no framework) |
| Storage | JSON file in `%AppData%\drader\games.json` |
| Build | [electron-builder](https://www.electron.build/) → NSIS installer |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Windows 10/11, macOS 10.13+, or Linux (Ubuntu 18.04+)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/tarassamb-bit/Drader_Launcher.git
cd Drader_Launcher

# Install dependencies
npm install

# Start in dev mode
npm start
```

### Build Installer

```bash
npm run build
# Output: dist/Drader Setup 2.0.0.exe (Windows)
```

---

## 📂 Project Structure

```
Drader_Launcher/
├── main.js              # Main process: IPC, game launch, file dialogs
├── preload.js           # Context bridge (secure renderer ↔ main)
├── package.json         # App config + electron-builder settings
├── renderer/
│   ├── index.html       # App shell
│   ├── style.css        # Dark theme styles
│   └── app.js           # All UI logic (library, stats, settings, modals)
└── icons/
    └── icon.png         # App icon
```

---

## 🗃️ Data Storage

All game data is stored locally at:
```
%AppData%\drader\games.json
```
No account required. No cloud. Your data stays on your machine.

---

## 🤝 Contributing

Pull requests are welcome! Feel free to open an issue for bugs or feature requests.

---

## 📄 License

MIT — do whatever you want with it.

---

<div align="center">
Made with ❤️ by <a href="https://github.com/tarassamb-bit">tarassamb-bit</a>
</div>
