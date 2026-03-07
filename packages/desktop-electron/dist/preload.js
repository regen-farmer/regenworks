"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    invoke: (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args),
    onUpdateAvailable: (cb) => electron_1.ipcRenderer.on("update-available", (_e, info) => cb(info)),
    onUpdateDownloaded: (cb) => electron_1.ipcRenderer.on("update-downloaded", (_e, info) => cb(info)),
    installUpdate: () => electron_1.ipcRenderer.send("install-update"),
});
