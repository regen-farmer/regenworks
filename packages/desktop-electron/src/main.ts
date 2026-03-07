import { app, BrowserWindow, ipcMain, nativeImage } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

// Load the native GIS addon — must use require() for native modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gisNapi = require("@rw/gis-napi");

app.setName("RegenWorks");

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const iconPath = path.join(__dirname, "..", "icons", process.platform === "darwin" ? "icon.icns" : process.platform === "win32" ? "icon.ico" : "icon.png");

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "default",
    title: `RegenWorks v${app.getVersion()}`,
  });

  // Override user agent: Auth0 Universal Login blocks embedded browsers (e.g. Electron).
  // Strip the Electron/ token so Auth0 sees a regular Chrome browser.
  const ua = mainWindow.webContents.getUserAgent().replace(/\s*Electron\/\S+/, "");
  mainWindow.webContents.setUserAgent(ua);

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(process.resourcesPath, "client", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:10000");
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- IPC handlers (mirror the Tauri commands) ---

ipcMain.handle("generate_layout", async (_event, { systemdesign, fieldGeometry }) => {
  const systemdesignJson =
    typeof systemdesign === "string" ? systemdesign : JSON.stringify(systemdesign);
  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);

  const resultJson: string = gisNapi.generateLayout(systemdesignJson, geometryString);
  return resultJson;
});

ipcMain.handle("get_engine_version", () => {
  return gisNapi.getEngineVersion() as string;
});

ipcMain.handle("health_check", () => {
  return gisNapi.healthCheck() as boolean;
});

// --- Auto-updater ---

function initUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      notes: info.releaseNotes ?? "",
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update-downloaded", { version: info.version });
  });
}

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

// --- App lifecycle ---

app.whenReady().then(() => {
  // Set dock icon on macOS (BrowserWindow.icon doesn't affect the dock)
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(
      path.join(__dirname, "..", "icons", "icon.png"),
    );
    app.dock.setIcon(dockIcon);
  }

  createWindow();

  setTimeout(initUpdater, 5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
