import { useEffect, useState } from 'react'
import {
  Button, Table, Typography, Space, message,
  Popconfirm, Empty, Modal, Input,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, UserOutlined, UploadOutlined, PictureOutlined,
} from '@ant-design/icons'

const { Text } = Typography
const { TextArea } = Input

// ── LocalImage: loads local disk image via IPC → base64 data URL ──────────────
function LocalImage({ path, style }: { path: string; style?: React.CSSProperties }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    window.leo.fileReadImage(path).then(setSrc)
  }, [path])
  if (!src) return <div style={{ ...style, background: '#1c1c2e', borderRadius: 8 }} />
  return <img src={src} style={style} alt="" />
}

export default function CharactersPage() {
  const [characters, setCharacters] = useState<CharacterRow[]>([])
  const [modalOpen, setModalOpen]   = useState(false)
  const [name, setName]             = useState('')
  const [desc, setDesc]             = useState('')
  const [imagePath, setImagePath]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => { loadList() }, [])

  async function loadList() {
    try { setCharacters(await window.leo.charactersList()) } catch {}
  }

  function openModal() {
    setName(''); setDesc(''); setImagePath(null)
    setModalOpen(true)
  }

  async function handleBrowse() {
    const p = await window.leo.charactersBrowse()
    if (p) setImagePath(p)
  }

  async function handleCreate() {
    if (!name.trim()) return message.warning('Nhập tên nhân vật')
    if (!imagePath)   return message.warning('Chọn ảnh nhân vật')
    setLoading(true)
    try {
      await window.leo.charactersCreate(name.trim(), desc.trim(), imagePath)
      message.success('Đã lưu nhân vật!')
      setModalOpen(false)
      await loadList()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    await window.leo.charactersDelete(id)
    await loadList()
  }

  const columns = [
    {
      title: 'Ảnh', dataIndex: 'image_path', width: 72, align: 'center' as const,
      render: (p: string) => (
        <LocalImage path={p} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #2d2d4e' }} />
      ),
    },
    {
      title: 'Tên', dataIndex: 'name',
      render: (v: string) => <Text style={{ color: '#a5b4fc', fontWeight: 600 }}>{v}</Text>,
    },
    {
      title: 'Mô tả', dataIndex: 'description',
      render: (v: string) => <Text style={{ fontSize: 12, color: '#888' }}>{v || '—'}</Text>,
    },
    {
      title: 'Ngày tạo', dataIndex: 'created_at', width: 130, align: 'center' as const,
      render: (v: string) => <Text style={{ fontSize: 11, color: '#555' }}>{v?.slice(0, 16)}</Text>,
    },
    {
      title: '', key: 'actions', width: 56, align: 'center' as const,
      render: (_: any, r: CharacterRow) => (
        <Popconfirm title="Xóa nhân vật này?" onConfirm={() => handleDelete(r.id)} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}>
          <Button size="small" icon={<DeleteOutlined />} type="text" danger />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: '#6b6b9a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          <UserOutlined /> Nhân vật ({characters.length})
        </Text>
        <Button
          type="primary" icon={<PlusOutlined />} onClick={openModal}
          style={{ background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', fontWeight: 700 }}
        >
          Thêm nhân vật
        </Button>
      </div>

      {/* Table */}
      {characters.length === 0 ? (
        <Empty description={<span style={{ color: '#333355' }}>Chưa có nhân vật nào</span>} />
      ) : (
        <Table
          dataSource={characters} columns={columns}
          rowKey="id" size="small" pagination={false}
        />
      )}

      {/* Add Modal */}
      <Modal
        title={<span><UserOutlined style={{ marginRight: 8, color: '#818cf8' }} />Thêm nhân vật</span>}
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
        okText="Lưu" cancelText="Hủy"
        styles={{
          content: { background: '#1c1c2e', border: '1px solid #2d2d4e' },
          header:  { background: '#1c1c2e' },
          footer:  { background: '#1c1c2e' },
        }}
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={10}>
          <Input
            placeholder="Tên nhân vật…"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ background: '#13131f', borderColor: '#3d3d6e' }}
          />
          <TextArea
            placeholder="Mô tả (tuỳ chọn)…"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={2}
            style={{ background: '#13131f', borderColor: '#3d3d6e', fontSize: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button icon={<UploadOutlined />} onClick={handleBrowse}>Chọn ảnh</Button>
            {imagePath ? (
              <>
                <LocalImage path={imagePath} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #4f4f7f' }} />
                <Text style={{ fontSize: 11, color: '#818cf8' }}>{imagePath.split(/[/\\]/).pop()}</Text>
              </>
            ) : (
              <Text style={{ fontSize: 11, color: '#444466' }}><PictureOutlined /> Chưa chọn ảnh</Text>
            )}
          </div>
        </Space>
      </Modal>
    </div>
  )
}
