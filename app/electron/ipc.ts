import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import axios from 'axios'
import { machineIdSync } from 'node-machine-id'
import {
  addCookie, listCookies, deleteCookie,
  updateCookieTokens, getCookieById, getAllCookieStrings,
  logGeneration, updateGenStatus, listGenerations, deleteGeneration,
  createProject, listProjects, deleteProject,
  createCharacter, listCharacters, deleteCharacter,
  getSetting, saveSetting,
} from './db'
import { getTokenFromCookie, getUserInfo, createGeneration, pollStatus, getImageUrls, uploadImagePath } from './leonardoApi'

const getWin = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

export function registerIpc() {

  // ── Cookie management ────────────────────────────────────────────────────
  ipcMain.handle('cookies:add', async (_, cookieLines: string) => {
    const lines = cookieLines.split('\n').map(s => s.trim()).filter(Boolean)
    const ids: number[] = []
    for (const line of lines) {
      const id = await addCookie(line) as number
      ids.push(id)
    }
    return { ok: true, added: ids.length }
  })

  ipcMain.handle('cookies:addFile', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Select cookies.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (!filePaths.length) return { ok: false }
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    const lines = content.split('\n').map(s => s.trim()).filter(Boolean)
    let added = 0
    for (const line of lines) {
      await addCookie(line)
      added++
    }
    return { ok: true, added }
  })

  ipcMain.handle('cookies:list', async () => {
    return listCookies()
  })

  ipcMain.handle('cookies:delete', async (_, id: number) => {
    await deleteCookie(id)
    return { ok: true }
  })

  ipcMain.handle('cookies:refreshAll', async (event) => {
    const rows = await getAllCookieStrings()
    const results: any[] = []
    for (const row of rows) {
      try {
        const token = await getTokenFromCookie(row.cookie_str)
        if (!token) {
          await updateCookieTokens(row.id, 0, '', '', 'FAILED')
          results.push({ id: row.id, status: 'FAILED', tokens: 0 })
          event.sender.send('cookies:progress', { id: row.id, status: 'FAILED', tokens: 0 })
          continue
        }
        const info = await getUserInfo(token)
        const status = info.tokens > 0 ? 'READY' : 'EMPTY'
        await updateCookieTokens(row.id, info.tokens, info.email, info.userId, status)
        results.push({ id: row.id, ...info, status })
        event.sender.send('cookies:progress', { id: row.id, ...info, status })
      } catch (e: any) {
        await updateCookieTokens(row.id, 0, '', '', 'ERROR')
        results.push({ id: row.id, status: 'ERROR', error: e.message })
        event.sender.send('cookies:progress', { id: row.id, status: 'ERROR', tokens: 0 })
      }
    }
    return results
  })

  // ── Load prompts from .txt file ──────────────────────────────────────────
  ipcMain.handle('prompts:loadFile', async () => {
    const { filePaths } = await dialog.showOpenDialog(getWin(), {
      title: 'Select prompts.txt',
      filters: [{ name: 'Text File', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (!filePaths.length) return null
    return fs.readFileSync(filePaths[0], 'utf-8')
  })

  // ── Image upload ──────────────────────────────────────────────────────────────────────
  ipcMain.handle('image:browse', async () => {
    const { filePaths } = await dialog.showOpenDialog(getWin(), {
      title: 'Select Reference Image(s)',
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }],
      properties: ['openFile', 'multiSelections']
    })
    return filePaths.length ? filePaths : null
  })

  ipcMain.handle('image:upload', async (event, cookieId: number, filePath: string) => {
    const row = await getCookieById(cookieId)
    if (!row) throw new Error('Cookie not found')
    const token = await getTokenFromCookie(row.cookie_str)
    if (!token) throw new Error('Cannot get session token')
    event.sender.send('image:uploadProgress', 'Getting presigned URL…')
    const initImageId = await uploadImagePath(token, filePath)
    event.sender.send('image:uploadProgress', `Done: ${initImageId}`)
    return initImageId
  })

  // ── Generate ─────────────────────────────────────────────────────────────
  // Start generation for ONE prompt on ONE cookie, return genId immediately
  ipcMain.handle('generate:create', async (_, cookieId: number, prompt: string, modelId: string, apiType: string, width: number, height: number, quantity: number, initImageIds?: string[]) => {
    const row = await getCookieById(cookieId)
    if (!row) throw new Error('Cookie not found')
    const token = await getTokenFromCookie(row.cookie_str)
    if (!token) throw new Error('Cannot get session token from cookie')
    const genId = await createGeneration(token, prompt, modelId, apiType, width, height, quantity, initImageIds)
    return genId
  })

  ipcMain.handle('generate:poll', async (_, cookieId: number, genId: string) => {
    const row = await getCookieById(cookieId)
    if (!row) throw new Error('Cookie not found')
    const token = await getTokenFromCookie(row.cookie_str)
    if (!token) throw new Error('Cannot get session token')
    return pollStatus(token, genId)
  })

  ipcMain.handle('generate:getUrl', async (_, cookieId: number, genId: string) => {
    const row = await getCookieById(cookieId)
    if (!row) throw new Error('Cookie not found')
    const token = await getTokenFromCookie(row.cookie_str)
    if (!token) throw new Error('Cannot get session token')
    return getImageUrls(token, genId)
  })

  // ── Full generate flow (fire and stream progress back) ───────────────────────
  ipcMain.handle('generate:run', async (event, jobs: Array<{
    rowIdx: number; cookieId: number; prompt: string
    modelId: string; apiType: string; width: number; height: number
    quantity: number; initImageIds?: string[]; projectId?: number
  }>) => {
    const send = (rowIdx: number, status: string, url = '') =>
      event.sender.send('generate:progress', { rowIdx, status, url })

    await Promise.all(jobs.map(async (job) => {
      send(job.rowIdx, 'Generating…')
      try {
        const row = await getCookieById(job.cookieId)
        if (!row) { send(job.rowIdx, '❌ Cookie not found'); return }
        const token = await getTokenFromCookie(row.cookie_str)
        if (!token) { send(job.rowIdx, '❌ Auth failed'); return }
        console.log(`[generate:run] job=${job.rowIdx} qty=${job.quantity} refs=${JSON.stringify(job.initImageIds ?? null)}`)
        const genId = await createGeneration(token, job.prompt, job.modelId, job.apiType, job.width, job.height, job.quantity, job.initImageIds)
        // Save to DB
        await logGeneration(job.cookieId, job.prompt, job.modelId, genId, job.projectId)
        send(job.rowIdx, `Waiting… (${genId.slice(0,8)})`)

        // Poll
        const deadline = Date.now() + 5 * 60_000
        let status = 'PENDING'
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 4000))
          status = await pollStatus(token, genId)
          if (status === 'COMPLETE' || status === 'FAILED') break
        }

        if (status === 'COMPLETE') {
          const urls = await getImageUrls(token, genId)
          // Store first URL in DB, then emit one progress event per image
          await updateGenStatus(genId, 'COMPLETE', urls[0])
          urls.forEach((url, i) => send(job.rowIdx + i, '✅ Done', url))
        } else {
          await updateGenStatus(genId, status, '')
          send(job.rowIdx, `❌ ${status}`)
        }
      } catch (e: any) {
        console.error(`[generate:run] rowIdx=${job.rowIdx} FAILED:`, e)
        send(job.rowIdx, `❌ ${String(e.message).slice(0, 80)}`)
      }
    }))

    return { done: true }
  })

  // ── List / delete generation history ──────────────────────────────────────
  ipcMain.handle('generations:list', async (_, projectId?: number) => {
    return listGenerations(projectId)
  })

  ipcMain.handle('generations:delete', async (_, id: number) => {
    await deleteGeneration(id)
    return { ok: true }
  })

  // ── Projects ───────────────────────────────────────────────────────────────
  ipcMain.handle('projects:list', async () => listProjects())

  ipcMain.handle('projects:create', async (_, name: string, description?: string) => {
    const id = await createProject(name, description)
    return { ok: true, id }
  })

  ipcMain.handle('projects:delete', async (_, id: number) => {
    await deleteProject(id)
    return { ok: true }
  })

  // ── Characters ─────────────────────────────────────────────────────────────
  ipcMain.handle('characters:list', async () => listCharacters())

  ipcMain.handle('characters:browse', async () => {
    const { filePaths } = await dialog.showOpenDialog(getWin(), {
      title: 'Chọn ảnh nhân vật',
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }],
      properties: ['openFile'],
    })
    return filePaths.length ? filePaths[0] : null
  })

  ipcMain.handle('characters:create', async (_, name: string, description: string, imagePath: string) => {
    // Copy image to persistent userData dir so path stays valid
    const { app } = await import('electron')
    const destDir = path.join(app.getPath('userData'), 'characters')
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    const ext  = path.extname(imagePath)
    const dest = path.join(destDir, `${Date.now()}${ext}`)
    fs.copyFileSync(imagePath, dest)
    const id = await createCharacter(name, description, dest)
    return { ok: true, id }
  })

  ipcMain.handle('characters:delete', async (_, id: number) => {
    await deleteCharacter(id)
    return { ok: true }
  })

  // ── Read local file as base64 data URL (for displaying local images) ─────────
  ipcMain.handle('file:readImage', async (_, filePath: string) => {
    try {
      const buf = fs.readFileSync(filePath)
      const ext  = path.extname(filePath).slice(1).toLowerCase()
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  })

  // ── Folder: browse + scan ────────────────────────────────────────────────
  ipcMain.handle('folder:browse', async () => {
    const { filePaths } = await dialog.showOpenDialog(getWin(), {
      title: 'Chọn thư mục ảnh',
      properties: ['openDirectory'],
    })
    return filePaths[0] ?? null
  })

  ipcMain.handle('folder:scan', async (_, folderPath: string) => {
    const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])
    const entries = fs.readdirSync(folderPath).sort()

    const images  = entries
      .filter(f => IMG_EXT.has(path.extname(f).toLowerCase()))
      .map(f => path.join(folderPath, f))

    // Read prompts.txt if present (one line per image, matched by sort order)
    let prompts: string[] = []
    const promptFile = path.join(folderPath, 'prompts.txt')
    if (fs.existsSync(promptFile)) {
      prompts = fs.readFileSync(promptFile, 'utf8')
        .split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
    }

    return { images, prompts }
  })

  // ── File save (single image) ────────────────────────────────────
  ipcMain.handle('file:saveImage', async (_, url: string, suggestedName: string) => {
    const { filePath } = await dialog.showSaveDialog(getWin(), {
      defaultPath: suggestedName,
      filters: [{ name: 'Image', extensions: ['jpg','png','webp'] }]
    })
    if (!filePath) return { ok: false }
    const resp = await fetch(url)
    const buf  = Buffer.from(await resp.arrayBuffer())
    fs.writeFileSync(filePath, buf)
    return { ok: true, path: filePath }
  })

  // ── File save zip (Download All) ────────────────────────────────
  ipcMain.handle('file:saveZip', async (
    _,
    entries: { url: string; filename: string }[],
    zipName: string
  ) => {
    const { filePath } = await dialog.showSaveDialog(getWin(), {
      defaultPath: `${zipName}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })
    if (!filePath) return { ok: false }

    const zip = new AdmZip()
    // Download all images in parallel then add to zip
    await Promise.all(entries.map(async (entry) => {
      try {
        const resp = await fetch(entry.url)
        const buf  = Buffer.from(await resp.arrayBuffer())
        zip.addFile(entry.filename, buf)
      } catch { /* skip failed downloads */ }
    }))

    zip.writeZip(filePath)
    return { ok: true, path: filePath }
  })

  // ── Auth \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const AUTH_URL = 'https://serverkey.taothaoai.com/api/leonardo_ai/auth'

  ipcMain.handle('auth:verify', async () => {
    try {
      const key = await getSetting('auth_key')
      if (!key) return { success: false }

      const device_id = machineIdSync()
      const response = await axios.post(AUTH_URL, { key, device_id })
      const data = response.data ?? {}

      if (data.expires_at) await saveSetting('auth_expires_at', data.expires_at)

      const expires_at = data.expires_at ?? await getSetting('auth_expires_at')
      return { success: response.status === 200, expires_at }
    } catch (error: any) {
      // Server unreachable — fallback to cached expiry for offline grace period
      const key        = await getSetting('auth_key')
      const expires_at = await getSetting('auth_expires_at')

      if (!key) return { success: false }

      // If we have a cached expiry and it hasn't passed → allow access
      if (expires_at) {
        const expired = new Date(expires_at).getTime() < Date.now()
        if (!expired) return { success: true, expires_at, offline: true }
        // Cached expiry has passed → force re-auth
        return { success: false, expires_at, error: 'Key đã hết hạn' }
      }

      // No cached expiry — we can't know, deny access
      return { success: false, error: error.response?.data?.message || error.message }
    }
  })

  ipcMain.handle('auth:login', async (_event, key: string) => {
    try {
      const device_id = machineIdSync()
      const response = await axios.post(AUTH_URL, { key, device_id })
      const data = response.data ?? {}
      if (response.status === 200) {
        await saveSetting('auth_key', key)
        if (data.expires_at) await saveSetting('auth_expires_at', data.expires_at)
        return { success: true, expires_at: data.expires_at }
      }
      return { success: false, error: data.message ?? 'Invalid key' }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message }
    }
  })

  ipcMain.handle('auth:get-device-id', () => machineIdSync())

  ipcMain.handle('auth:logout', async () => {
    await saveSetting('auth_key', '')
    await saveSetting('auth_expires_at', '')
  })
}
