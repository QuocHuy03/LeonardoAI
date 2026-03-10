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
  // Prompts
  promptsLoadFile: () => electron.ipcRenderer.invoke("prompts:loadFile"),
  // Generate
  generateRun: (jobs) => electron.ipcRenderer.invoke("generate:run", jobs),
  onGenProgress: (cb) => {
    electron.ipcRenderer.on("generate:progress", (_, d) => cb(d));
    return () => electron.ipcRenderer.removeAllListeners("generate:progress");
  },
  // Generation history
  generationsList: (projectId) => electron.ipcRenderer.invoke("generations:list", projectId),
  generationDelete: (id) => electron.ipcRenderer.invoke("generations:delete", id),
  // Projects
  projectsList: () => electron.ipcRenderer.invoke("projects:list"),
  projectsCreate: (name, desc) => electron.ipcRenderer.invoke("projects:create", name, desc),
  projectsDelete: (id) => electron.ipcRenderer.invoke("projects:delete", id),
  // File
  fileSaveImage: (url, name) => electron.ipcRenderer.invoke("file:saveImage", url, name),
  fileSaveZip: (entries, zipName) => electron.ipcRenderer.invoke("file:saveZip", entries, zipName),
  fileReadImage: (filePath) => electron.ipcRenderer.invoke("file:readImage", filePath),
  // Folder import
  folderBrowse: () => electron.ipcRenderer.invoke("folder:browse"),
  folderScan: (folderPath) => electron.ipcRenderer.invoke("folder:scan", folderPath),
  // Auth
  authVerify: () => electron.ipcRenderer.invoke("auth:verify"),
  authLogin: (key) => electron.ipcRenderer.invoke("auth:login", key),
  authLogout: () => electron.ipcRenderer.invoke("auth:logout"),
  authGetDeviceId: () => electron.ipcRenderer.invoke("auth:get-device-id"),
  // Auto-updater
  onUpdaterEvent: (cb) => {
    electron.ipcRenderer.on("updater:event", (_, d) => cb(d));
    return () => electron.ipcRenderer.removeAllListeners("updater:event");
  },
  updaterInstall: () => electron.ipcRenderer.send("updater:install"),
  // Characters
  charactersList: () => electron.ipcRenderer.invoke("characters:list"),
  charactersBrowse: () => electron.ipcRenderer.invoke("characters:browse"),
  charactersCreate: (name, desc, imagePath) => electron.ipcRenderer.invoke("characters:create", name, desc, imagePath),
  charactersDelete: (id) => electron.ipcRenderer.invoke("characters:delete", id)
});
