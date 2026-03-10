import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to renderer via window.leo
contextBridge.exposeInMainWorld('leo', {
  // Cookies
  cookiesAdd:        (lines: string)    => ipcRenderer.invoke('cookies:add', lines),
  cookiesAddFile:    ()                  => ipcRenderer.invoke('cookies:addFile'),
  cookiesList:       ()                  => ipcRenderer.invoke('cookies:list'),
  cookiesDelete:     (id: number)        => ipcRenderer.invoke('cookies:delete', id),
  cookiesRefreshAll: ()                  => ipcRenderer.invoke('cookies:refreshAll'),
  onCookiesProgress: (cb: (d: any) => void) => {
    ipcRenderer.on('cookies:progress', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('cookies:progress')
  },

  // Image upload
  imageBrowse:  ()                              => ipcRenderer.invoke('image:browse'),
  imageUpload:  (cookieId: number, path: string) => ipcRenderer.invoke('image:upload', cookieId, path),
  onUploadProgress: (cb: (msg: string) => void) => {
    ipcRenderer.on('image:uploadProgress', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('image:uploadProgress')
  },

  // Prompts
  promptsLoadFile: () => ipcRenderer.invoke('prompts:loadFile'),

  // Generate
  generateRun:  (jobs: any[]) => ipcRenderer.invoke('generate:run', jobs),
  onGenProgress: (cb: (d: any) => void) => {
    ipcRenderer.on('generate:progress', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('generate:progress')
  },

  // Generation history
  generationsList:   (projectId?: number) => ipcRenderer.invoke('generations:list', projectId),
  generationDelete:  (id: number)         => ipcRenderer.invoke('generations:delete', id),

  // Projects
  projectsList:   ()                                    => ipcRenderer.invoke('projects:list'),
  projectsCreate: (name: string, desc?: string)         => ipcRenderer.invoke('projects:create', name, desc),
  projectsDelete: (id: number)                          => ipcRenderer.invoke('projects:delete', id),

  // File
  fileSaveImage: (url: string, name: string) => ipcRenderer.invoke('file:saveImage', url, name),
  fileSaveZip:   (entries: { url: string; filename: string }[], zipName: string) => ipcRenderer.invoke('file:saveZip', entries, zipName),
  fileReadImage: (filePath: string) => ipcRenderer.invoke('file:readImage', filePath),

  // Folder import
  folderBrowse: ()                  => ipcRenderer.invoke('folder:browse'),
  folderScan:   (folderPath: string) => ipcRenderer.invoke('folder:scan', folderPath),

  // Auth
  authVerify:      ()           => ipcRenderer.invoke('auth:verify'),
  authLogin:       (key: string) => ipcRenderer.invoke('auth:login', key),
  authLogout:      ()           => ipcRenderer.invoke('auth:logout'),
  authGetDeviceId: ()           => ipcRenderer.invoke('auth:get-device-id'),

  // Auto-updater
  onUpdaterEvent: (cb: (d: { event: string; data?: any }) => void) => {
    ipcRenderer.on('updater:event', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('updater:event')
  },
  updaterInstall: () => ipcRenderer.send('updater:install'),

  // Characters
  charactersList:   ()                                                      => ipcRenderer.invoke('characters:list'),
  charactersBrowse: ()                                                      => ipcRenderer.invoke('characters:browse'),
  charactersCreate: (name: string, desc: string, imagePath: string)        => ipcRenderer.invoke('characters:create', name, desc, imagePath),
  charactersDelete: (id: number)                                            => ipcRenderer.invoke('characters:delete', id),
})
