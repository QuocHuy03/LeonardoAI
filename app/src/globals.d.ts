// Global type for window.leo API exposed via preload
export {}

declare global {
  interface Window {
    leo: {
      cookiesAdd:        (lines: string) => Promise<{ ok: boolean; added: number }>
      cookiesAddFile:    () => Promise<{ ok: boolean; added?: number }>
      cookiesList:       () => Promise<CookieRow[]>
      cookiesDelete:     (id: number) => Promise<{ ok: boolean }>
      cookiesRefreshAll: () => Promise<any[]>
      onCookiesProgress: (cb: (d: CookieProgress) => void) => () => void

      imageBrowse:      () => Promise<string[] | null>
      imageUpload:      (cookieId: number, path: string) => Promise<string>
      onUploadProgress: (cb: (msg: string) => void) => () => void

      promptsLoadFile: () => Promise<string | null>

      generateRun:    (jobs: GenerateJob[]) => Promise<{ done: boolean }>
      onGenProgress:  (cb: (d: GenProgress) => void) => () => void

      generationsList:  (projectId?: number) => Promise<GenerationRow[]>
      generationDelete: (id: number) => Promise<{ ok: boolean }>

      projectsList:   () => Promise<ProjectRow[]>
      projectsCreate: (name: string, desc?: string) => Promise<{ ok: boolean; id: number }>
      projectsDelete: (id: number) => Promise<{ ok: boolean }>

      fileSaveImage: (url: string, name: string) => Promise<{ ok: boolean; path?: string }>
      fileSaveZip:   (entries: { url: string; filename: string }[], zipName: string) => Promise<{ ok: boolean; path?: string }>

      onUpdaterEvent: (cb: (d: { event: string; data?: any }) => void) => () => void
      updaterInstall: () => void
    }
  }

  interface CookieRow {
    id: number
    name: string
    email: string
    tokens: number
    status: string
    user_id: string
    updated_at: string
  }

  interface CookieProgress {
    id: number
    status: string
    tokens: number
    email?: string
  }

  interface GenerateJob {
    rowIdx: number
    cookieId: number
    prompt: string
    modelId: string
    apiType: string
    width: number
    height: number
    quantity: number
    initImageIds?: string[]
    projectId?: number
  }

  interface GenProgress {
    rowIdx: number
    status: string
    url: string
  }

  interface GenerationRow {
    id: number
    project_id: number | null
    cookie_id: number
    prompt: string
    model_id: string
    gen_id: string
    status: string
    image_url: string
    created_at: string
  }

  interface ProjectRow {
    id: number
    name: string
    description: string
    created_at: string
  }
}
