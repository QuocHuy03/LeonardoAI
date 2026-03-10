import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import AdmZip from 'adm-zip'
import {
  addCookie, listCookies, deleteCookie,
  updateCookieTokens, getCookieById, getAllCookieStrings,
  logGeneration, updateGenStatus, listGenerations, deleteGeneration,
  createProject, listProjects, deleteProject
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
}
