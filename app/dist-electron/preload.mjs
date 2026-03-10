"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("leo", {
  // Cookies
  cookiesAdd: (lines) => electron.ipcRenderer.invoke("cookies:add", lines),
  cookiesAddFile: () => electron.ipcRenderer.invoke("cookies:addFile"),
  cookiesList: () => electron.ipcRenderer.invoke("cookies:list"),
  cookiesDelete: (id) => electron.ipcRenderer.invoke("cookies:delete", id),
  cookiesRefreshAll: () => electron.ipcRenderer.invoke("cookies:refreshAll"),
  onCookiesProgress: (cb) => {
    electron.ipcRenderer.on("cookies:progress", (_, d) => cb(d));
    return () => electron.ipcRenderer.removeAllListeners("cookies:progress");
  },
  // Image upload
  imageBrowse: () => electron.ipcRenderer.invoke("image:browse"),
  imageUpload: (cookieId, path) => electron.ipcRenderer.invoke("image:upload", cookieId, path),
  onUploadProgress: (cb) => {
    electron.ipcRenderer.on("image:uploadProgress", (_, msg) => cb(msg));
    return () => electron.ipcRenderer.removeAllListeners("image:uploadProgress");
  },
  // Generate
  generateRun: (jobs) => electron.ipcRenderer.invoke("generate:run", jobs),
  onGenProgress: (cb) => {
    electron.ipcRenderer.on("generate:progress", (_, d) => cb(d));
    return () => electron.ipcRenderer.removeAllListeners("generate:progress");
  },
  // File
  fileSaveImage: (url, name) => electron.ipcRenderer.invoke("file:saveImage", url, name)
});
