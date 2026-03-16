import { app, BrowserWindow, ipcMain, nativeImage, protocol, net, session } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import fs from "fs";

const API_URL = "https://staging.regenfarmer.com";

// Load the native GIS addon lazily — may fail in packaged builds
let gisNapi: any = null;
function loadGisNapi() {
  if (!gisNapi) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    gisNapi = require("@rw/gis-napi");
  }
  return gisNapi;
}

app.setName("RegenWorks");

// Register custom protocol for serving client files with proper URL routing
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

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

  // Log page load errors
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`Failed to load ${url}: ${desc} (${code})`);
  });

  if (app.isPackaged) {
    mainWindow.loadURL("app://localhost/");
  } else {
    mainWindow.loadURL("http://localhost:10000");
    mainWindow.webContents.openDevTools();
  }

  mainWindow.show();

  // After Auth0 login, the staging server redirects to its own origin.
  // Intercept navigations to the API server that aren't part of the auth flow,
  // copy auth cookies to app://, and redirect back to the local app.
  if (app.isPackaged) {
    let authInProgress = false;

    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (url.includes("/api/auth/")) {
        authInProgress = true;
        if (url.startsWith("app://")) {
          event.preventDefault();
          const authPath = new URL(url).pathname;
          mainWindow?.loadURL(`${API_URL}${authPath}`);
        }
      }
    });

    // Catch SPA (pushState) navigations to auth routes
    mainWindow.webContents.on("did-navigate-in-page", (_event, url) => {
      if (url.includes("/api/auth/")) {
        authInProgress = true;
        const authPath = new URL(url).pathname;
        mainWindow?.loadURL(`${API_URL}${authPath}`);
      }
    });

    mainWindow.webContents.on("did-navigate", async (_event, url) => {
      // After auth completes, the server redirects to its root.
      // Catch any navigation to the API server that isn't an auth endpoint.
      if (url.startsWith(API_URL) && !url.includes("/api/auth/")) {
        if (authInProgress) {
          authInProgress = false;
          // Copy auth cookies from the API domain to app://
          const cookies = await session.defaultSession.cookies.get({ url: API_URL });
          for (const cookie of cookies) {
            if (cookie.name.startsWith("auth0") || cookie.name === "appSession") {
              await session.defaultSession.cookies.set({
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

ipcMain.handle("generate_layout", async (_event, { systemdesign, fieldGeometry }) => {
  const systemdesignJson =
    typeof systemdesign === "string" ? systemdesign : JSON.stringify(systemdesign);
  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);

  const resultJson: string = loadGisNapi().generateLayout(systemdesignJson, geometryString);
  return resultJson;
});

ipcMain.handle("get_engine_version", () => {
  return loadGisNapi().getEngineVersion() as string;
});

ipcMain.handle("health_check", () => {
  return loadGisNapi().healthCheck() as boolean;
});

// Proxy fetch requests from renderer to bypass CORS (like Tauri's native HTTP plugin)
ipcMain.handle("native_fetch", async (_event, url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => {
  const resp = await net.fetch(url, {
    method: options?.method || "GET",
    headers: options?.headers,
    body: options?.body,
  });
  const body = await resp.text();
  return { status: resp.status, statusText: resp.statusText, body };
});

// --- Auto-updater ---

function initUpdater() {
  if (!app.isPackaged) return;

  // Allow pre-release updates only when running a pre-release version
  const currentVersion = app.getVersion();
  autoUpdater.allowPrerelease = currentVersion.includes("-");

  console.log("[Updater] Checking for updates...");
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[Updater] Check failed:", err);
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Update available: ${info.version}`);
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log(`[Updater] App is up to date (${info.version})`);
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`[Updater] Download: ${progress.percent.toFixed(1)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: ${info.version}`);
    mainWindow?.webContents.send("update-downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err);
  });
}

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

// --- App lifecycle ---

app.whenReady().then(() => {
  // Serve client files via app:// protocol so the SPA router gets proper URLs
  const clientDir = path.join(process.resourcesPath, "client");
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    // Redirect auth requests to the staging server
    if (pathname.startsWith("/api/auth/")) {
      return Response.redirect(`${API_URL}${pathname}${url.search}`, 302);
    }

    let filePath = path.join(clientDir, pathname);

    // SPA fallback: serve _shell.html for routes that don't map to a file
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(clientDir, "_shell.html");
    }

    return net.fetch(`file://${filePath}`);
  });

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
