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

// Customize the "About RegenWorks" menu entry (macOS / Linux).
// Windows' built-in About dialog is minimal; we surface the same info in the UI
// via the update banner instead.
app.setAboutPanelOptions({
  applicationName: "RegenWorks",
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: `Copyright © ${new Date().getFullYear()} Regen Farmer ApS`,
  website: "https://regenworks.com",
});

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
    titleBarStyle: "hiddenInset",
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

// Latest update state, kept so the renderer can query it after it mounts
// (the main process may fire update-available/downloaded before the renderer
// has registered its IPC listener). Only used for the background hourly check —
// the blocking startup check handles its own state via the splash window.
let latestUpdateAvailable: { version: string; notes: string } | null = null;
let latestUpdateDownloaded: { version: string } | null = null;

// Hourly re-check after the app is running, so long sessions still pick up new
// releases via the in-app toast. The initial blocking check at launch handles
// the common case.
function initBackgroundUpdater() {
  if (!app.isPackaged) return;

  const currentVersion = app.getVersion();
  autoUpdater.allowPrerelease = currentVersion.includes("-");

  const checkForUpdates = () => {
    console.log("[Updater] Hourly check...");
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error("[Updater] Hourly check failed:", err);
    });
  };

  setInterval(checkForUpdates, 60 * 60 * 1000);

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Update available: ${info.version}`);
    latestUpdateAvailable = {
      version: info.version,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    };
    mainWindow?.webContents.send("update-available", latestUpdateAvailable);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: ${info.version}`);
    latestUpdateDownloaded = { version: info.version };
    mainWindow?.webContents.send("update-downloaded", latestUpdateDownloaded);
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err);
  });
}

ipcMain.handle("get-update-state", () => ({
  available: latestUpdateAvailable,
  downloaded: latestUpdateDownloaded,
}));

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

// --- Blocking startup updater (Discord-style) ---
//
// Shows a splash window while checking for and downloading updates. If an update
// is installed, the app relaunches automatically. If no update is found or the
// check times out / errors out, the main window opens normally.

const STARTUP_UPDATE_TIMEOUT_MS = 10_000;

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 380,
    height: 200,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const version = app.getVersion();
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #18181b; color: #fafafa;
    display: flex; flex-direction: column; justify-content: center; height: 100vh;
    -webkit-app-region: drag; user-select: none;
  }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
  p  { font-size: 12px; color: #a1a1aa; margin: 0 0 16px; }
  #status { font-size: 12px; color: #a1a1aa; margin-top: 8px; }
  .bar {
    height: 6px; width: 100%; background: #27272a; border-radius: 3px; overflow: hidden;
  }
  .bar > span {
    display: block; height: 100%; width: 0%; background: #22c55e;
    transition: width .2s ease-out;
  }
</style>
</head>
<body>
  <h1>RegenWorks</h1>
  <p>Version ${version}</p>
  <div class="bar"><span id="fill"></span></div>
  <div id="status">Checking for updates…</div>
  <script>
    window.addEventListener("message", (e) => {
      const { status, percent } = e.data || {};
      if (status) document.getElementById("status").textContent = status;
      if (typeof percent === "number") document.getElementById("fill").style.width = percent + "%";
    });
  </script>
</body>
</html>`;

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return splash;
}

function sendSplash(splash: BrowserWindow, payload: { status?: string; percent?: number }) {
  if (splash.isDestroyed()) return;
  splash.webContents.send("__splash", payload);
  // Using a script directly since we don't have a preload for the splash
  splash.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify(payload)}, "*")`,
  ).catch(() => {});
}

async function runStartupUpdateCheck(splash: BrowserWindow): Promise<boolean> {
  // Returns true if the app is about to quit-and-install; false if we should
  // continue launching the main window.

  const currentVersion = app.getVersion();
  autoUpdater.allowPrerelease = currentVersion.includes("-");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (willInstall: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      cleanup();
      resolve(willInstall);
    };

    const onUpdateAvailable = (info: { version: string }) => {
      console.log(`[Updater] Startup: update available ${info.version}`);
      sendSplash(splash, { status: `Downloading ${info.version}…`, percent: 0 });
    };

    const onNotAvailable = () => {
      console.log("[Updater] Startup: app is up to date");
      settle(false);
    };

    const onProgress = (p: { percent: number }) => {
      sendSplash(splash, { percent: Math.round(p.percent) });
    };

    const onDownloaded = (info: { version: string }) => {
      console.log(`[Updater] Startup: downloaded ${info.version}, installing…`);
      sendSplash(splash, { status: "Installing update…", percent: 100 });
      // Give the splash a moment to paint the final state, then quit & install
      setTimeout(() => {
        settle(true);
        autoUpdater.quitAndInstall();
      }, 500);
    };

    const onError = (err: Error) => {
      console.error("[Updater] Startup check error:", err);
      settle(false);
    };

    const cleanup = () => {
      autoUpdater.removeListener("update-available", onUpdateAvailable);
      autoUpdater.removeListener("update-not-available", onNotAvailable);
      autoUpdater.removeListener("download-progress", onProgress);
      autoUpdater.removeListener("update-downloaded", onDownloaded);
      autoUpdater.removeListener("error", onError);
    };

    autoUpdater.on("update-available", onUpdateAvailable);
    autoUpdater.on("update-not-available", onNotAvailable);
    autoUpdater.on("download-progress", onProgress);
    autoUpdater.on("update-downloaded", onDownloaded);
    autoUpdater.on("error", onError);

    const timeoutHandle = setTimeout(() => {
      console.warn("[Updater] Startup check timed out, launching anyway");
      settle(false);
    }, STARTUP_UPDATE_TIMEOUT_MS);

    console.log("[Updater] Startup: checking for updates…");
    autoUpdater.checkForUpdates().catch(onError);
  });
}

// --- App lifecycle ---

app.whenReady().then(async () => {
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

  // Dev mode: skip the splash/update dance, just open the main window.
  if (!app.isPackaged) {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    return;
  }

  // Packaged mode: show splash, check for updates, then open main window (or
  // relaunch if an update was installed).
  const splash = createSplashWindow();
  splash.once("ready-to-show", () => splash.show());

  const willInstall = await runStartupUpdateCheck(splash);
  if (willInstall) {
    // autoUpdater.quitAndInstall() is in flight; don't create the main window.
    return;
  }

  splash.destroy();
  createWindow();
  initBackgroundUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
