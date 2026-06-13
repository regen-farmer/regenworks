import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  copyToClipboard: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  saveFile: (defaultName: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke("file:save-dialog", { defaultName, content }),

  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  onUpdateAvailable: (cb: (info: { version: string; notes: string }) => void) =>
    ipcRenderer.on("update-available", (_e, info) => cb(info)),

  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    ipcRenderer.on("update-downloaded", (_e, info) => cb(info)),

  getUpdateState: (): Promise<{
    available: { version: string; notes: string } | null;
    downloaded: { version: string } | null;
  }> => ipcRenderer.invoke("get-update-state"),

  installUpdate: () => ipcRenderer.send("install-update"),

  auth: {
    getSession: (): Promise<{
      auth0Token: string;
      auth0User: Record<string, unknown>;
    } | null> => ipcRenderer.invoke("auth:get-session"),
    login: (): Promise<{
      auth0Token: string;
      auth0User: Record<string, unknown>;
    }> => ipcRenderer.invoke("auth:login"),
    logout: (): Promise<void> => ipcRenderer.invoke("auth:logout"),
    onSessionChanged: (
      cb: (session: { auth0Token: string; auth0User: Record<string, unknown> } | null) => void,
    ) => ipcRenderer.on("auth:session-changed", (_e, session) => cb(session)),
  },
});
