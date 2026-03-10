import { useEffect, useRef, useState } from 'react'
import {
  Button, Table, Tag, Space, Input, message,
  Typography, Popconfirm, Card,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined,
  UploadOutlined,
} from '@ant-design/icons'

const { TextArea } = Input
const { Text } = Typography

interface CookieRow {
  id: number
  name: string
  email: string
  tokens: number
  status: string
  updated_at: string
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'default', READY: 'success', EMPTY: 'warning',
  FAILED: 'error', ERROR: 'error',
}

export default function CookiesPage() {
  const [rows, setRows]         = useState<CookieRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [pasteText, setPasteText] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const cleanupRef = useRef<() => void>()

  useEffect(() => {
    if (!window.leo) return
    loadList()
    // Subscribe to refresh progress
    const cleanup = window.leo.onCookiesProgress((d) => {
      // update row inline
      setRows(prev =>
        prev.map(r =>
          r.id === d.id
            ? { ...r, tokens: d.tokens, status: d.status, email: d.email || r.email }
            : r
        )
      )
    })
    cleanupRef.current = cleanup
    return cleanup
  }, [])

  async function loadList() {
    setLoading(true)
    try {
      const data = await window.leo.cookiesList()
      setRows(data as CookieRow[])
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPaste() {
    if (!pasteText.trim()) return message.warning('Paste at least one cookie string')
    setLoading(true)
    try {
      const res = await window.leo.cookiesAdd(pasteText)
      message.success(`Added ${res.added} cookie(s)`)
      setPasteText('')
      await loadList()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddFile() {
    const res = await window.leo.cookiesAddFile()
    if (res.ok) {
      message.success(`Imported ${res.added} cookies from file`)
      await loadList()
    }
  }

  async function handleDelete(id: number) {
    await window.leo.cookiesDelete(id)
    setSelectedIds(prev => prev.filter(x => x !== id))
    message.success('Deleted')
    await loadList()
  }

  async function handleDeleteSelected() {
    for (const id of selectedIds) {
      await window.leo.cookiesDelete(id)
    }
    setSelectedIds([])
    message.success(`Deleted ${selectedIds.length} cookie(s)`)
    await loadList()
  }

  async function handleRefreshAll() {
    setRefreshing(true)
    try {
      await window.leo.cookiesRefreshAll()
      await loadList()
      message.success('All accounts refreshed')
    } finally {
      setRefreshing(false)
    }
  }

  const total = rows.length
  const ready = rows.filter(r => r.status === 'READY').length
  const totalTokens = rows.reduce((s, r) => s + (r.tokens || 0), 0)

  const columns = [
    { title: '#', dataIndex: 'id', width: 50 },
    {
      title: 'Name / Email',
      key: 'name',
      render: (_: any, r: CookieRow) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ color: '#a0a0ff' }}>{r.name || `Account_${r.id}`}</Text>
          {r.email && <Text type="secondary" style={{ fontSize: 11 }}>{r.email}</Text>}
        </Space>
      ),
    },
    {
      title: 'Tokens',
      dataIndex: 'tokens',
      width: 90,
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#4ade80' : '#666' }}>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (st: string) => <Tag color={STATUS_COLORS[st] || 'default'}>{st}</Tag>,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      width: 140,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v?.slice(0, 16)}</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, r: CookieRow) => (
        <Popconfirm title="Delete this cookie?" onConfirm={() => handleDelete(r.id)} okText="Yes">
          <Button danger icon={<DeleteOutlined />} size="small" type="text" />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Total', value: total, color: '#818cf8' },
          { label: 'Ready',  value: ready, color: '#4ade80' },
          { label: 'Total Tokens', value: totalTokens.toLocaleString(), color: '#f59e0b' },
        ].map(s => (
          <Card
            key={s.label}
            size="small"
            style={{ background: '#1c1c2e', border: '1px solid #2d2d4e', minWidth: 110 }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b6b9a' }}>{s.label}</div>
          </Card>
        ))}
        <div style={{ flex: 1 }} />
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          loading={refreshing}
          onClick={handleRefreshAll}
          type="primary" ghost
        >
          Refresh All Tokens
        </Button>
      </div>

      {/* Add cookies */}
      <Card
        size="small"
        title="Add Cookies"
        style={{ marginBottom: 16, background: '#1c1c2e', border: '1px solid #2d2d4e' }}
        extra={
          <Button icon={<UploadOutlined />} size="small" onClick={handleAddFile}>
            Import .txt file
          </Button>
        }
      >
        <TextArea
          rows={4}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          placeholder="Paste cookie string(s) here — one per line..."
          style={{ fontFamily: 'monospace', fontSize: 11, background: '#13131f', marginBottom: 8 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddPaste}
          loading={loading}
        >
          Add Cookies
        </Button>
      </Card>

      {/* Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: '#6b6b9a', fontSize: 11 }}>
          {selectedIds.length > 0 ? `${selectedIds.length} selected` : `${rows.length} cookies`}
        </Text>
        {selectedIds.length > 0 && (
          <Popconfirm
            title={`Xóa ${selectedIds.length} cookie?`}
            description="Hành động này không thể hoàn tác."
            onConfirm={handleDeleteSelected}
            okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              Xóa ({selectedIds.length})
            </Button>
          </Popconfirm>
        )}
      </div>
      <Table<CookieRow>
        dataSource={rows}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showTotal: t => `${t} cookies` }}
        style={{ background: '#1c1c2e' }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
      />
    </div>
  )
}
