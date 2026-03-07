import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  onUpdateAvailable: (cb: (info: { version: string; notes: string }) => void) =>
    ipcRenderer.on("update-available", (_e, info) => cb(info)),

  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    ipcRenderer.on("update-downloaded", (_e, info) => cb(info)),

  installUpdate: () => ipcRenderer.send("install-update"),
});
