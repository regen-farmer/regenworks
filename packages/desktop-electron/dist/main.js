"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const path_1 = __importDefault(require("path"));
// Load the native GIS addon — must use require() for native modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gisNapi = require("@rw/gis-napi");
electron_1.app.setName("RegenWorks");
let mainWindow = null;
function createWindow() {
    const iconPath = path_1.default.join(__dirname, "..", "icons", process.platform === "darwin" ? "icon.icns" : process.platform === "win32" ? "icon.ico" : "icon.png");
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: electron_1.nativeImage.createFromPath(iconPath),
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
        titleBarStyle: "default",
        title: `RegenWorks v${electron_1.app.getVersion()}`,
    });
    // Override user agent: Auth0 Universal Login blocks embedded browsers (e.g. Electron).
    // Strip the Electron/ token so Auth0 sees a regular Chrome browser.
    const ua = mainWindow.webContents.getUserAgent().replace(/\s*Electron\/\S+/, "");
    mainWindow.webContents.setUserAgent(ua);
    if (electron_1.app.isPackaged) {
        mainWindow.loadFile(path_1.default.join(process.resourcesPath, "client", "index.html"));
    }
    else {
        mainWindow.loadURL("http://localhost:10000");
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
// --- IPC handlers (mirror the Tauri commands) ---
electron_1.ipcMain.handle("generate_layout", async (_event, { systemdesign, fieldGeometry }) => {
    const systemdesignJson = typeof systemdesign === "string" ? systemdesign : JSON.stringify(systemdesign);
    const geometryString = typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);
    const resultJson = gisNapi.generateLayout(systemdesignJson, geometryString);
    return resultJson;
});
electron_1.ipcMain.handle("get_engine_version", () => {
    return gisNapi.getEngineVersion();
});
electron_1.ipcMain.handle("health_check", () => {
    return gisNapi.healthCheck();
});
// --- Auto-updater ---
function initUpdater() {
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
    electron_updater_1.autoUpdater.on("update-available", (info) => {
        mainWindow?.webContents.send("update-available", {
            version: info.version,
            notes: info.releaseNotes ?? "",
        });
    });
    electron_updater_1.autoUpdater.on("update-downloaded", (info) => {
        mainWindow?.webContents.send("update-downloaded", { version: info.version });
    });
}
electron_1.ipcMain.on("install-update", () => {
    electron_updater_1.autoUpdater.quitAndInstall();
});
// --- App lifecycle ---
electron_1.app.whenReady().then(() => {
    // Set dock icon on macOS (BrowserWindow.icon doesn't affect the dock)
    if (process.platform === "darwin" && electron_1.app.dock) {
        const dockIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "..", "icons", "icon.png"));
        electron_1.app.dock.setIcon(dockIcon);
    }
    createWindow();
    setTimeout(initUpdater, 5000);
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
