# Electron Desktop POS — Build & Run Guide

This guide contains the successful commands used to transform the web-based POS into a standalone desktop application.

## 1. Initial Setup
Run these commands when setting up the project on a new machine:
```bash
# 1. Install all standard project dependencies
npm install

# 2. Specific installation for Desktop components (if needed)
npm install better-sqlite3@11.3.0
npm install --save-dev electron@33.0.0 electron-builder electron-is-dev @electron/rebuild
```

## 2. Rebuilding for Electron (Critical)
Native modules like `better-sqlite3` must be recompiled for the Electron environment:
```bash
# Rebuild the SQLite driver
npx --yes @electron/rebuild -f -w better-sqlite3
```

## 3. Running for Development
Launch the GUI for testing:
```bash
# Standard Launch
npm run electron:dev

# Linux Sandbox Bypass (If GUI doesn't open)
ELECTRON_DISABLE_SANDBOX=1 npm run electron:dev
```
r
## 4. Building Installers
Generate the final files for distribution in the `dist/` folder:

### For Linux (.deb)
```bash
# Build the installer
npm run electron:build

# Install the generated package (run from the project root)
sudo apt install ./dist/pos-system_1.0.0_amd64.deb
```

### For Windows (.exe)
Best run on a Windows machine:
```bash
# Build the installer
npx electron-builder build --win
```
**To Install**: Simply double-click the generated `pos-system Setup 1.0.0.exe` file in the `dist/` folder.

## 5. Troubleshooting (Linux)
Fix sandbox permissions if the app fails to start after installation:
```bash
sudo chown root ./node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 ./node_modules/electron/dist/chrome-sandbox
```

---

## 🔑 Default Credentials
Use these for the first login:
- **Super Admin**: `owner` / `admin123`
- **Shop Admin**: `admin` / `admin123`
