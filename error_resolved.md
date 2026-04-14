# Resolved Errors & Fixes

This file documents critical system errors encountered during development and their resolutions.

## 🔴 Error: Electron "SIGSEGV" Crash on Print/Save Bill

### Description
When attempting to print a receipt or save a bill, the Electron application would immediately crash with a `SIGSEGV` (Segmentation Fault) error. This occurred primarily on Linux environments.

### Root Cause
1.  **Chromium Sandbox**: The default Electron sandbox on some Linux distributions prevents access to certain system resources (like printers or the filesystem) required for PDF generation and printing.
2.  **GPU Acceleration**: Conflicts between hardware acceleration and the PDF rendering engine occasionally trigger segmentation faults during memory-intensive operations like printing.

### Resolution
The following steps were taken to stabilize the application:

#### 1. Disabling Sandbox at Runtime
The application must be launched with the `--no-sandbox` flag or the equivalent environment variable to allow it to interface correctly with the OS print drivers.
- **Command**: `ELECTRON_DISABLE_SANDBOX=1 npm run electron:dev`

#### 2. Disabling Hardware Acceleration
Hardware acceleration was disabled in the main process to prevent GPU-related crashes during PDF rendering.
- **File**: `electron-main.js`
- **Code**:
  ```javascript
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration(); // Added to prevent SIGSEGV
  ```

#### 3. Sandbox Permissions (Post-Build)
For the installed `.deb` package, the sandbox binary permissions were corrected.
- **Command**:
  ```bash
  sudo chown root ./node_modules/electron/dist/chrome-sandbox
  sudo chmod 4755 ./node_modules/electron/dist/chrome-sandbox
  ```

### Status
✅ **Resolved** (Stable on Linux and Windows)
