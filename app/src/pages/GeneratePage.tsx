import { useEffect, useRef, useState } from 'react'
import {
  Button, Select, Table, Input, message, Image,
  Card, Typography, Progress, Badge, Space, Tag, Modal, Popconfirm,
} from 'antd'
import {
  ThunderboltOutlined, DownloadOutlined,
  PictureOutlined, FileTextOutlined,
  FolderOutlined, PlusOutlined, DeleteOutlined, FolderOpenOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { MODELS, SIZES, CORE_COLORS, REF_TYPE_LABELS, REF_TYPE_COLORS, type AspectRatio } from '../constants'

const { TextArea } = Input
const { Text } = Typography

// LocalImage: reads local file via IPC → base64 data URL (works in Electron renderer)
function LocalImage({ path, style }: { path: string; style?: React.CSSProperties }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { if (path) window.leo.fileReadImage(path).then(setSrc) }, [path])
  if (!src) return <div style={{ ...style, background: '#1c1c2e' }} />
  return <img src={src} style={style} alt="" />
}

interface ResultRow {
  key: number
  dbId: number
  prompt: string
  status: string
  url: string
  cookieId: number
  charPreview?: string[]   // image_paths of matched characters (for pending preview)
  folderImagePath?: string // local image from folder import, used as initImage
}

const RATIOS: AspectRatio[] = ['2:3', '1:1', '3:2', '16:9', '9:16']

export default function GeneratePage() {
  // ── Project state ─────────────────────────────────────────────────────────
  const [projects, setProjects]         = useState<ProjectRow[]>([])
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [newProjectName, setNewProjectName]   = useState('')
  const [newProjectModal, setNewProjectModal] = useState(false)

  // ── Cookie / gen state ────────────────────────────────────────────────────
  const [cookies, setCookies]       = useState<{ id: number; name: string; tokens: number; status: string }[]>([])
  const [modelName, setModelName]   = useState('Nano Banana 2')
  const [ratio, setRatio]           = useState<AspectRatio>('1:1')
  const [sizeIdx, setSizeIdx]       = useState(0)
  const [promptText, setPromptText] = useState('')
  const [results, setResults]       = useState<ResultRow[]>([])
  const [selectedKeys, setSelectedKeys] = useState<number[]>([])
  const [running, setRunning]       = useState(false)
  const [quantity, setQuantity]     = useState(1)
  const [characters, setCharacters] = useState<CharacterRow[]>([])
  const cleanupRef = useRef<(() => void) | null>(null)

  // ── Character matching helper ──────────────────────────────────────────────
  // Normalize: lowercase + collapse spaces/underscores → single space
  const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').trim()

  function matchChar(prompt: string): CharacterRow | null {
    const np = norm(prompt)
    return characters.find(c => np.includes(norm(c.name))) ?? null
  }

  // Match ALL characters found in a prompt
  function matchChars(prompt: string): CharacterRow[] {
    const np = norm(prompt)
    return characters.filter(c => np.includes(norm(c.name)))
  }

  // ── Parse prompts → table rows ───────────────────────────────────────────────
  function handleParse() {
    const lines = promptText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return message.warning('Enter at least one prompt')
    const keyOffset = Date.now()
    const rows: ResultRow[] = lines.map((p, i) => ({
      key: keyOffset + i,
      dbId: 0,
      prompt: p,
      status: 'Pending',
      url: '',
      cookieId: cookies[i % Math.max(cookies.length, 1)]?.id ?? 0,
      charPreview: matchChars(p).map(c => c.image_path),
    }))
    setResults(rows)
  }

  // ── Folder import ───────────────────────────────────────────────────────
  async function handleFolderImport() {
    const folderPath = await window.leo.folderBrowse()
    if (!folderPath) return
    const { images, prompts: folderPrompts } = await window.leo.folderScan(folderPath)
    if (!images.length) return message.warning('No images found in folder')

    // Build a combined prompt pool:
    // 1. prompts.txt lines from the folder
    // 2. fallback: lines from the textarea prompt
    // 3. If still not enough → cycle from start of pool
    const textareaLines = promptText.split('\n').map(l => l.trim()).filter(Boolean)
    const pool = folderPrompts.length ? folderPrompts : textareaLines
    const getPrompt = (i: number) =>
      pool.length ? pool[i % pool.length] : `Image ${i + 1}`

    const keyOffset = Date.now()
    const newRows: ResultRow[] = images.map((imgPath, i) => {
      const prompt = getPrompt(i)
      const chars  = matchChars(prompt)
      return {
        key: keyOffset + i,
        dbId: 0,
        prompt,
        status: 'Pending',
        url: '',
        cookieId: cookies[i % Math.max(cookies.length, 1)]?.id ?? 0,
        charPreview: chars.length ? chars.map(c => c.image_path) : [imgPath],
        folderImagePath: imgPath,
      }
    })

    // Merge: keep existing non-Pending rows, replace Pending ones with the new import
    setResults(prev => {
      const kept = prev.filter(r => r.status !== 'Pending')
      return [...kept, ...newRows]
    })
    message.success(`Loaded ${images.length} images from folder`)
  }

  const model     = MODELS.find(m => m.name === modelName) || MODELS[0]
  const sizeTiers = SIZES[ratio]
  const selSize   = sizeTiers[sizeIdx]

  useEffect(() => {
    loadCookies()
    loadProjects()
    loadCharacters()
  }, [])

  // Reload results whenever activeProjectId changes
  useEffect(() => {
    loadHistory(activeProjectId ?? undefined)
  }, [activeProjectId])

  // ── Loaders ───────────────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const list = await window.leo.projectsList()
      setProjects(list)
    } catch {}
  }

  async function loadCharacters() {
    try { setCharacters(await window.leo.charactersList()) } catch {}
  }

  async function loadHistory(projectId?: number) {
    try {
      const rows = await window.leo.generationsList(projectId)
      setResults(
        rows.map((r, i) => ({
          key: i,
          dbId: r.id,
          prompt: r.prompt,
          status: r.status === 'COMPLETE' ? 'Done' : r.status === 'FAILED' ? 'Failed' : r.status,
          url: r.image_url || '',
          cookieId: r.cookie_id,
        }))
      )
    } catch {}
  }

  async function loadCookies() {
    try {
      const list = await window.leo.cookiesList()
      setCookies(
        (list as any[])
          .filter(r => r.status === 'READY')
          .map(r => ({ id: r.id, name: r.name || `Account_${r.id}`, tokens: r.tokens, status: r.status }))
      )
    } catch {}
  }

  // ── Project actions ───────────────────────────────────────────────────────
  async function handleCreateProject() {
    const name = newProjectName.trim()
    if (!name) return message.warning('Nhập tên project')
    const res = await window.leo.projectsCreate(name)
    if (res.ok) {
      setNewProjectName('')
      setNewProjectModal(false)
      await loadProjects()
      setActiveProjectId(res.id)
    }
  }

  async function handleDeleteProject(id: number) {
    await window.leo.projectsDelete(id)
    await loadProjects()
    if (activeProjectId === id) setActiveProjectId(null)
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (activeProjectId === null) { setNewProjectModal(true); return }
    if (cookies.length === 0) {
      message.error('No READY cookies. Go to Cookies tab and refresh tokens.')
      return
    }
    const prompts = promptText.split('\n').map(p => p.trim()).filter(Boolean)
    if (!prompts.length) { message.warning('Enter at least one prompt'); return }

    // Auto-detect & upload character images per prompt
    // Also handle folder-imported images (per cookie cache)
    const charUploadCache = new Map<string, string>()
    const promptInitIds: (string[] | undefined)[] = []

    message.loading({ content: 'Uploading references…', key: 'charUpload' })
    await Promise.all(prompts.map(async (p, i) => {
      const cookie = cookies[i % cookies.length]

      // Folder image takes priority as initImage
      const folderImg = results.find(r => r.prompt === p && r.folderImagePath)?.folderImagePath
      if (folderImg && model.refType !== 'NONE') {
        const cacheKey = `folder_${folderImg}_${cookie.id}`
        try {
          if (!charUploadCache.has(cacheKey)) {
            const id = await window.leo.imageUpload(cookie.id, folderImg)
            charUploadCache.set(cacheKey, id)
          }
          // Also include any character images found in the prompt
          const charIds: string[] = [charUploadCache.get(cacheKey)!]
          for (const char of matchChars(p)) {
            const ck = `${char.id}_${cookie.id}`
            if (!charUploadCache.has(ck)) {
              const id = await window.leo.imageUpload(cookie.id, char.image_path)
              charUploadCache.set(ck, id)
            }
            charIds.push(charUploadCache.get(ck)!)
          }
          promptInitIds[i] = charIds
        } catch { promptInitIds[i] = undefined }
        return
      }

      // Character-only (no folder image)
      const chars = matchChars(p)
      if (chars.length && model.refType !== 'NONE') {
        const ids: string[] = []
        for (const char of chars) {
          const cacheKey = `${char.id}_${cookie.id}`
          try {
            if (!charUploadCache.has(cacheKey)) {
              const id = await window.leo.imageUpload(cookie.id, char.image_path)
              charUploadCache.set(cacheKey, id)
            }
            ids.push(charUploadCache.get(cacheKey)!)
          } catch {}
        }
        promptInitIds[i] = ids.length ? ids : undefined
      } else {
        promptInitIds[i] = undefined
      }
    }))
    message.destroy('charUpload')

    const keyOffset = Date.now()
    const newRows: ResultRow[] = []
    prompts.forEach((p, pi) => {
      for (let q = 0; q < quantity; q++) {
        newRows.push({ key: keyOffset + pi * quantity + q, dbId: 0, prompt: p, status: 'Queued', url: '', cookieId: cookies[pi % cookies.length].id })
      }
    })
    setResults(prev => [...newRows, ...prev])
    setRunning(true)

    const cleanup = window.leo.onGenProgress((d) => {
      setResults(prev =>
        prev.map(r => r.key === keyOffset + d.rowIdx ? { ...r, status: d.status, url: d.url } : r)
      )
    })
    cleanupRef.current = cleanup

    try {
      const jobs: GenerateJob[] = prompts.map((p, i) => ({
        rowIdx:       i * quantity,
        cookieId:     cookies[i % cookies.length].id,
        prompt:       p,
        modelId:      model.modelId,
        apiType:      model.apiType,
        width:        selSize.w,
        height:       selSize.h,
        quantity,
        initImageIds: promptInitIds[i],
        projectId:    activeProjectId,
      }))
      await window.leo.generateRun(jobs)
      message.success('All jobs finished!')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setRunning(false)
      cleanup()
      // Always reload from DB so failed rows stay visible with their status
      await loadHistory(activeProjectId ?? undefined)
    }
  }

  function makeSafeName(idx: number, prompt: string) {
    const safe = prompt.slice(0, 50).replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    return `${idx + 1}_${safe}.jpg`
  }

  async function handleDownload(url: string, prompt: string, idx: number) {
    const filename = makeSafeName(idx, prompt)
    await window.leo.fileSaveImage(url, filename)
  }

  async function handleDownloadAll() {
    const withUrl = results.filter(r => r.url)
    if (!withUrl.length) return
    const zipName = activeProject?.name || 'images'
    const entries = withUrl.map((r) => ({
      url: r.url,
      filename: makeSafeName(results.indexOf(r), r.prompt),
    }))
    await window.leo.fileSaveZip(entries, zipName)
  }

  async function handleDeleteSelected() {
    for (const key of selectedKeys) {
      const row = results.find(r => r.key === key)
      if (row?.dbId) await window.leo.generationDelete(row.dbId)
    }
    setSelectedKeys([])
    await loadHistory(activeProjectId ?? undefined)
  }

  async function handleDeleteRow(dbId: number) {
    if (dbId) await window.leo.generationDelete(dbId)
    await loadHistory(activeProjectId ?? undefined)
  }

  async function handleLoadPromptsFile() {
    try {
      const content = await window.leo.promptsLoadFile()
      if (content === null) return // user cancelled
      setPromptText(content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim())
    } catch (e: any) {
      message.error('Cannot read file: ' + e.message)
    }
  }

  async function handleRetryRow(r: ResultRow) {
    if (activeProjectId === null || cookies.length === 0) return
    // Auto-detect character for the retried prompt
    const char = matchChar(r.prompt)
    let initImageIds: string[] | undefined
    if (char && model.refType !== 'NONE') {
      try {
        const id = await window.leo.imageUpload(cookies[0].id, char.image_path)
        initImageIds = [id]
      } catch {}
    }
    const keyOffset = Date.now()
    const retryRow: ResultRow = { key: keyOffset, dbId: 0, prompt: r.prompt, status: 'Queued', url: '', cookieId: r.cookieId }
    setResults(prev => prev.map(x => x.key === r.key ? retryRow : x))

    const cleanup = window.leo.onGenProgress((d) => {
      if (d.rowIdx === 0)
        setResults(prev => prev.map(x => x.key === keyOffset ? { ...x, status: d.status, url: d.url } : x))
    })
    try {
      const job: GenerateJob = {
        rowIdx: 0,
        cookieId: r.cookieId || cookies[0].id,
        prompt: r.prompt,
        modelId: model.modelId,
        apiType: model.apiType,
        width: selSize.w,
        height: selSize.h,
        quantity: 1,
        initImageIds: initImageIds?.length ? initImageIds : undefined,
        projectId: activeProjectId,
      }
      await window.leo.generateRun([job])
      await loadHistory(activeProjectId ?? undefined)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      cleanup()
    }
  }

  const doneCount = results.filter(r => r.status === 'Done' || r.status.startsWith('✅')).length

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    { title: '#', dataIndex: 'key', width: 44, align: 'center' as const, render: (v: number) => v + 1 },
    {
      title: 'Preview', dataIndex: 'url', width: 90, align: 'center' as const,
      render: (url: string, row: ResultRow) => {
        if (url) return (
          <Image src={url} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 6 }} preview={{ src: url }} />
        )
        if (row.charPreview?.length) return (
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
            {row.charPreview.map((p, i) => (
              <LocalImage key={i} path={p} style={{ width: row.charPreview!.length > 1 ? 34 : 72, height: row.charPreview!.length > 1 ? 34 : 72, objectFit: 'cover', borderRadius: 5, border: '1px solid #4f4f7f' }} />
            ))}
          </div>
        )
        return (
          <div style={{ width: 72, height: 72, background: '#1c1c2e', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PictureOutlined style={{ color: '#444' }} />
          </div>
        )
      },
    },
    {
      title: 'Prompt', dataIndex: 'prompt', align: 'center' as const,
      render: (t: string) => <Text style={{ fontSize: 12, color: '#aaa' }}>{t}</Text>,
    },
    {
      title: 'Status', dataIndex: 'status', width: 150, align: 'center' as const,
      render: (s: string) => {
        const cleaned = s.replace(/^[✅❌]\s*/, '')
        const color = s === 'Done' || s.startsWith('✅') ? '#4ade80' : s === 'Failed' || s.startsWith('❌') ? '#f87171' : '#818cf8'
        return <Text style={{ fontSize: 11, color }}>{cleaned}</Text>
      },
    },
    {
      title: '', key: 'actions', width: 104, align: 'center' as const,
      render: (_: any, r: ResultRow) => {
        const isFailed = r.status.startsWith('❌') || r.status === 'Failed'
        return (
          <Space size={2}>
            {r.url && (
              <Button size="small" icon={<DownloadOutlined />} type="text" onClick={() => handleDownload(r.url, r.prompt, r.key)} />
            )}
            {isFailed && (
              <Button size="small" icon={<ReloadOutlined />} type="text" style={{ color: '#818cf8' }}
                title="Retry" onClick={() => handleRetryRow(r)} />
            )}
            <Popconfirm title="Xóa ảnh này?" onConfirm={() => handleDeleteRow(r.dbId)} okText="Xóa" cancelText="Hủy">
              <Button size="small" icon={<DeleteOutlined />} type="text" danger />
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  const activeProject = projects.find(p => p.id === activeProjectId)

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>

      {/* ── Left panel: settings ─────────────────────────────────────────── */}
      <div style={{
        width: 280, minWidth: 260, padding: '16px 16px',
        borderRight: '1px solid #2d2d4e', overflowY: 'auto',
        background: '#13131f', display: 'flex', flexDirection: 'column', gap: 14,
      }}>

        {/* Project selector */}
        <div>
          <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            <FolderOutlined /> Project
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Select
              style={{ flex: 1 }}
              placeholder="Chọn project…"
              value={activeProjectId ?? undefined}
              onChange={v => setActiveProjectId(v)}
              options={[
                ...projects.map(p => ({ value: p.id, label: p.name })),
              ]}
              notFoundContent={<span style={{ color: '#555' }}>Chưa có project</span>}
            />
            <Button
              icon={<PlusOutlined />}
              onClick={() => setNewProjectModal(true)}
              title="Tạo project mới"
              style={{ flexShrink: 0 }}
            />
          </div>

          {/* Active project actions */}
          {activeProject && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderOpenOutlined style={{ color: '#818cf8' }} />
                <Text style={{ color: '#818cf8', fontSize: 12, fontWeight: 600 }}>{activeProject.name}</Text>
              </div>
              <Popconfirm
                title={`Xóa project "${activeProject.name}"?`}
                description="Tất cả ảnh trong project này sẽ bị xóa."
                onConfirm={() => handleDeleteProject(activeProject.id)}
                okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}
              >
                <Button size="small" icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #2d2d4e' }} />

        {/* Accounts */}
        <Card size="small" style={{ background: '#1c1c2e', border: '1px solid #2d2d4e' }}>
          <Space>
            <Badge count={cookies.length} color="#4ade80" overflowCount={99} />
            <Text style={{ color: '#6b6b9a', fontSize: 12 }}>READY accounts</Text>
          </Space>
          <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 13, marginTop: 4 }}>
            {cookies.reduce((s, c) => s + c.tokens, 0).toLocaleString()} tokens total
          </div>
          <Button size="small" type="link" style={{ padding: 0, marginTop: 2 }} onClick={loadCookies}>Refresh</Button>
        </Card>

        {/* Model */}
        <div>
          <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Model</div>
          <Select
            value={modelName} onChange={setModelName} style={{ width: '100%' }}
            options={MODELS.map(m => ({
              label: (
                <Space size={4}>
                  <Tag color={CORE_COLORS[m.core]} style={{ fontSize: 10, lineHeight: '14px', margin: 0 }}>{m.core}</Tag>
                  {m.name}
                </Space>
              ),
              value: m.name,
            }))}
          />
          <div style={{ color: '#555577', fontSize: 10, marginTop: 4 }}>{model.description}</div>
        </div>

        {/* Aspect ratio */}
        <div>
          <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Aspect Ratio</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RATIOS.map(r => (
              <button key={r} onClick={() => { setRatio(r); setSizeIdx(0) }} style={{
                flex: 1, padding: '6px 4px',
                border: `2px solid ${ratio === r ? '#6366f1' : '#2d2d4e'}`,
                background: ratio === r ? '#2a2a5e' : '#1c1c2e',
                borderRadius: 6, color: ratio === r ? '#a5b4fc' : '#6b6b9a',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              }}>{r}</button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Size</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {sizeTiers.map((t, i) => (
              <button key={t.label} onClick={() => setSizeIdx(i)} style={{
                flex: 1, padding: '6px 8px',
                border: `2px solid ${sizeIdx === i ? '#6366f1' : '#2d2d4e'}`,
                background: sizeIdx === i ? '#2a2a5e' : '#1c1c2e',
                borderRadius: 6, color: sizeIdx === i ? '#a5b4fc' : '#6b6b9a',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ color: '#444466', fontSize: 11, marginTop: 4, textAlign: 'center' }}>{selSize.w} × {selSize.h} px</div>
        </div>

        {/* Character ref info — only show if model supports image ref */}
        {model.refType !== 'NONE' && (
          <div>
            <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Image Ref
              <span style={{ marginLeft: 6, fontSize: 10, color: REF_TYPE_COLORS[model.refType],
                background: REF_TYPE_COLORS[model.refType] + '22', padding: '1px 6px', borderRadius: 4 }}>
                {REF_TYPE_LABELS[model.refType]}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#444466', lineHeight: 1.5 }}>
              Mention a Character name in your prompt — it will be auto-detected and uploaded as an image reference.
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Quantity selector */}
        <div>
          <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Images per prompt
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setQuantity(n)} style={{
                flex: 1, padding: '5px 0',
                border: `2px solid ${quantity === n ? '#6366f1' : '#2d2d4e'}`,
                background: quantity === n ? '#2a2a5e' : '#1c1c2e',
                borderRadius: 6, color: quantity === n ? '#a5b4fc' : '#6b6b9a',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
              }}>{n}</button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <Button
          type="primary" size="large" block
          icon={<ThunderboltOutlined />}
          loading={running}
          onClick={handleGenerate}
          disabled={activeProjectId === null}
          title={activeProjectId === null ? 'Chọn project trước' : ''}
          style={{
            background: activeProjectId === null ? undefined : 'linear-gradient(90deg, #4f46e5, #7c3aed)',
            border: 'none', height: 44, fontWeight: 700, fontSize: 15,
          }}
        >
          {running ? 'Generating…' : 'Generate'}
        </Button>

        {running && (
          <Progress
            percent={results.length ? Math.round((doneCount / results.length) * 100) : 0}
            size="small" strokeColor="#6366f1"
          />
        )}
      </div>

      {/* ── Right panel: prompts + results ──────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Prompt input */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2d2d4e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ color: '#6b6b9a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              <FileTextOutlined /> Prompts <span style={{ color: '#4ade80' }}>({promptText.split('\n').filter(l => l.trim()).length})</span>
            </Text>
            <Space size={6}>
              <Button size="small" icon={<FileTextOutlined />} onClick={handleLoadPromptsFile}>Load prompts.txt</Button>
              <Button size="small" icon={<FolderOpenOutlined />} onClick={handleFolderImport}>Chọn folder</Button>
              <Button size="small" type="primary" ghost onClick={handleParse}>Parse</Button>
              <Button size="small" danger onClick={() => setPromptText('')}>Clear</Button>
            </Space>
          </div>
          <TextArea
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            rows={5}
            placeholder={'Enter one prompt per line…\n\nA cat sitting on a throne\nA futuristic city at night'}
            style={{ fontFamily: 'monospace', fontSize: 12, background: '#0f0f1e', resize: 'vertical' }}
          />
        </div>

        {/* Results header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px 6px' }}>
          <Text style={{ color: '#6b6b9a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
            {activeProject
              ? <><FolderOpenOutlined style={{ marginRight: 4 }} />{activeProject.name} — {doneCount}/{results.length}</>
              : <>Results — {doneCount}/{results.length}</>}
          </Text>
          <Space size={6}>
            {selectedKeys.length > 0 && (
              <Popconfirm
                title={`Xóa ${selectedKeys.length} ảnh đã chọn?`}
                onConfirm={handleDeleteSelected}
                okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Xóa ({selectedKeys.length})
                </Button>
              </Popconfirm>
            )}
            {results.some(r => r.url) && (
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadAll}>Download All</Button>
            )}
          </Space>
        </div>

        {/* Results table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 0 12px' }}>
          {results.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60, color: '#333355' }}>
              <PictureOutlined style={{ fontSize: 40 }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>
                {activeProjectId === null
                  ? 'Chọn hoặc tạo một project để bắt đầu'
                  : 'Generated images will appear here'}
              </div>
            </div>
          ) : (
            <Table
              dataSource={results} columns={columns} rowKey="key"
              size="small" pagination={false} style={{ padding: '0 20px' }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: (keys) => setSelectedKeys(keys as number[]),
              }}
            />
          )}
        </div>
      </div>

      {/* ── Create Project Modal ─────────────────────────────────────────── */}
      <Modal
        title={<span><FolderOutlined style={{ marginRight: 8, color: '#818cf8' }} />Tạo Project mới</span>}
        open={newProjectModal}
        onOk={handleCreateProject}
        onCancel={() => { setNewProjectModal(false); setNewProjectName('') }}
        okText="Tạo" cancelText="Hủy"
        styles={{ content: { background: '#1c1c2e', border: '1px solid #2d2d4e' }, header: { background: '#1c1c2e' }, footer: { background: '#1c1c2e' } }}
      >
        <Input
          placeholder="Tên project…"
          value={newProjectName}
          onChange={e => setNewProjectName(e.target.value)}
          onPressEnter={handleCreateProject}
          autoFocus
          style={{ background: '#13131f', borderColor: '#3d3d6e', marginTop: 8 }}
        />
      </Modal>
    </div>
  )
}
