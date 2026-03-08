"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const API_URL = "https://staging.regenfarmer.com";
// Load the native GIS addon lazily — may fail in packaged builds
let gisNapi = null;
function loadGisNapi() {
    if (!gisNapi) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        gisNapi = require("@rw/gis-napi");
    }
    return gisNapi;
}
electron_1.app.setName("RegenWorks");
// Register custom protocol for serving client files with proper URL routing
electron_1.protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
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
    // Log page load errors
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.error(`Failed to load ${url}: ${desc} (${code})`);
    });
    if (electron_1.app.isPackaged) {
        mainWindow.loadURL("app://localhost/");
    }
    else {
        mainWindow.loadURL("http://localhost:10000");
        mainWindow.webContents.openDevTools();
    }
    mainWindow.show();
    // After Auth0 login, the staging server redirects to its own origin.
    // Intercept navigations to the API server that aren't part of the auth flow,
    // copy auth cookies to app://, and redirect back to the local app.
    if (electron_1.app.isPackaged) {
        let authInProgress = false;
        mainWindow.webContents.on("will-navigate", (_event, url) => {
            if (url.includes("/api/auth/")) {
                authInProgress = true;
            }
        });
        mainWindow.webContents.on("did-navigate", async (_event, url) => {
            // After auth completes, the server redirects to its root.
            // Catch any navigation to the API server that isn't an auth endpoint.
            if (url.startsWith(API_URL) && !url.includes("/api/auth/")) {
                if (authInProgress) {
                    authInProgress = false;
                    // Copy auth cookies from the API domain to app://
                    const cookies = await electron_1.session.defaultSession.cookies.get({ url: API_URL });
                    for (const cookie of cookies) {
                        if (cookie.name.startsWith("auth0") || cookie.name === "appSession") {
                            await electron_1.session.defaultSession.cookies.set({
                                url: "app://localhost",
                                name: cookie.name,
                                value: cookie.value,
                                path: "/",
                            });
                        }
                    }
                }
                mainWindow?.loadURL("app://localhost/");
            }
        });
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
// --- IPC handlers (mirror the Tauri commands) ---
electron_1.ipcMain.handle("generate_layout", async (_event, { systemdesign, fieldGeometry }) => {
    const systemdesignJson = typeof systemdesign === "string" ? systemdesign : JSON.stringify(systemdesign);
    const geometryString = typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);
    const resultJson = loadGisNapi().generateLayout(systemdesignJson, geometryString);
    return resultJson;
});
electron_1.ipcMain.handle("get_engine_version", () => {
    return loadGisNapi().getEngineVersion();
});
electron_1.ipcMain.handle("health_check", () => {
    return loadGisNapi().healthCheck();
});
// Proxy fetch requests from renderer to bypass CORS (like Tauri's native HTTP plugin)
electron_1.ipcMain.handle("native_fetch", async (_event, url, options) => {
    const resp = await electron_1.net.fetch(url, {
        method: options?.method || "GET",
        headers: options?.headers,
        body: options?.body,
    });
    const body = await resp.text();
    return { status: resp.status, statusText: resp.statusText, body };
});
// --- Auto-updater ---
function initUpdater() {
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch(() => { });
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
    // Serve client files via app:// protocol so the SPA router gets proper URLs
    const clientDir = path_1.default.join(process.resourcesPath, "client");
    electron_1.protocol.handle("app", (request) => {
        const url = new URL(request.url);
        let filePath = path_1.default.join(clientDir, decodeURIComponent(url.pathname));
        // SPA fallback: serve index.html for routes that don't map to a file
        if (!fs_1.default.existsSync(filePath) || fs_1.default.statSync(filePath).isDirectory()) {
            filePath = path_1.default.join(clientDir, "index.html");
        }
        return electron_1.net.fetch(`file://${filePath}`);
    });
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
