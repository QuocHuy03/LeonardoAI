import { useEffect, useRef, useState } from 'react'
import {
  Button, Select, Table, Input, message, Image,
  Card, Typography, Progress, Badge, Space, Tag, Modal, Popconfirm,
} from 'antd'
import {
  ThunderboltOutlined, DownloadOutlined,
  PictureOutlined, FileTextOutlined, UploadOutlined,
  FolderOutlined, PlusOutlined, DeleteOutlined, FolderOpenOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { MODELS, SIZES, CORE_COLORS, REF_TYPE_LABELS, REF_TYPE_COLORS, type AspectRatio } from '../constants'

const { TextArea } = Input
const { Text } = Typography

interface ResultRow {
  key: number
  dbId: number
  prompt: string
  status: string
  url: string
  cookieId: number
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
  // Multiple reference images: each has a local path and an uploaded ID
  const [refImages, setRefImages]   = useState<{ path: string; id: string | null; msg: string }[]>([])
  const cleanupRef = useRef<(() => void) | null>(null)

  const model     = MODELS.find(m => m.name === modelName) || MODELS[0]
  const sizeTiers = SIZES[ratio]
  const selSize   = sizeTiers[sizeIdx]

  useEffect(() => {
    loadCookies()
    loadProjects()
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
  async function handleUploadImage() {
    const filePaths = await window.leo.imageBrowse()
    if (!filePaths) return
    if (cookies.length === 0) {
      message.warning('No READY cookies — cannot upload reference image')
      return
    }
    // Add placeholders for all selected files
    const startIdx = refImages.length
    const newEntries = filePaths.map(p => ({ path: p, id: null, msg: 'Uploading…' }))
    setRefImages(prev => [...prev, ...newEntries])

    // Upload each file in parallel
    await Promise.all(filePaths.map(async (fp, i) => {
      try {
        const id = await window.leo.imageUpload(cookies[0].id, fp)
        setRefImages(prev => prev.map((e, idx) => idx === startIdx + i ? { ...e, id, msg: `✅ ${id.slice(0, 10)}…` } : e))
      } catch (err: any) {
        setRefImages(prev => prev.map((e, idx) => idx === startIdx + i ? { ...e, msg: `❌ ${err.message}` } : e))
      }
    }))
  }

  function handleRemoveRefImage(idx: number) {
    setRefImages(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleGenerate() {
    if (activeProjectId === null) {
      setNewProjectModal(true)
      return
    }
    if (cookies.length === 0) {
      message.error('No READY cookies. Go to Cookies tab and refresh tokens.')
      return
    }
    const prompts = promptText.split('\n').map(p => p.trim()).filter(Boolean)
    if (!prompts.length) { message.warning('Enter at least one prompt'); return }

    const initImageIds = refImages.filter(r => r.id).map(r => r.id!) 
    // N rows per prompt (quantity)
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
        initImageIds: initImageIds.length ? initImageIds : undefined,
        projectId:    activeProjectId,
      }))
      await window.leo.generateRun(jobs)
      message.success('All jobs finished!')
      await loadHistory(activeProjectId ?? undefined)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setRunning(false)
      cleanup()
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
    const initImageIds = refImages.filter(x => x.id).map(x => x.id!)
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
        initImageIds: initImageIds.length ? initImageIds : undefined,
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
      render: (url: string) =>
        url ? (
          <Image src={url} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 6 }} preview={{ src: url }} />
        ) : (
          <div style={{ width: 72, height: 72, background: '#1c1c2e', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PictureOutlined style={{ color: '#444' }} />
          </div>
        ),
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

        {/* Reference images — only show if model supports it */}
        {model.refType !== 'NONE' && (
          <div>
            <div style={{ fontSize: 11, color: '#6b6b9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Reference Images
              <span style={{ marginLeft: 6, fontSize: 10, color: REF_TYPE_COLORS[model.refType],
                background: REF_TYPE_COLORS[model.refType] + '22', padding: '1px 6px', borderRadius: 4 }}>
                {REF_TYPE_LABELS[model.refType]}
              </span>
            </div>
            <Button size="small" icon={<UploadOutlined />} onClick={handleUploadImage}>Browse (multi-select)</Button>
            {/* Image chips */}
            {refImages.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {refImages.map((img, idx) => (
                  <div key={idx} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center',
                    background: '#1c1c2e', border: '1px solid #2d2d4e', borderRadius: 6, padding: '3px 8px 3px 6px',
                    fontSize: 10, color: img.id ? '#4ade80' : '#818cf8', gap: 4 }}>
                    <span>{img.path.split(/[/\\]/).pop()?.slice(0,18)}</span>
                    <span style={{ color: '#555' }}>·</span>
                    <span>{img.msg}</span>
                    <button onClick={() => handleRemoveRefImage(idx)}
                      style={{ marginLeft: 4, background: 'none', border: 'none', color: '#f87171',
                        cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
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
