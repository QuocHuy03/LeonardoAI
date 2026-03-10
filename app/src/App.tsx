import { useEffect, useState } from 'react'
import { ConfigProvider, Layout, Menu, theme, notification, Button, Progress } from 'antd'
import {
  SafetyCertificateOutlined, AppstoreOutlined,
  CloudDownloadOutlined, UserOutlined, LogoutOutlined,
} from '@ant-design/icons'
import CookiesPage from './pages/CookiesPage'
import GeneratePage from './pages/GeneratePage'
import CharactersPage from './pages/CharactersPage'
import LoginPage from './pages/LoginPage'
import pkg from '../package.json'
import './App.css'

const { Sider, Content } = Layout

const navItems = [
  { key: 'cookies',    icon: <SafetyCertificateOutlined />, label: 'Cookies' },
  { key: 'generate',  icon: <AppstoreOutlined />,          label: 'Generate' },
  { key: 'characters',icon: <UserOutlined />,              label: 'Character' },
]

export default function App() {
  const [page, setPage]           = useState<'cookies' | 'generate' | 'characters'>('cookies')
  const [authed, setAuthed]       = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [api, contextHolder] = notification.useNotification()

  useEffect(() => {
    document.title = `Leonardo AI - Version ${pkg.version} - @huyit32`
  }, [])

  useEffect(() => {
    if (!window.leo?.onUpdaterEvent) return
    const cleanup = window.leo.onUpdaterEvent(({ event, data }) => {
      if (event === 'available') {
        api.info({
          key: 'update',
          message: `Update available: v${data?.version}`,
          description: 'Downloading update in background…',
          icon: <CloudDownloadOutlined style={{ color: '#818cf8' }} />,
          duration: 5,
        })
      }
      if (event === 'progress') setDownloadProgress(data)
      if (event === 'downloaded') {
        setDownloadProgress(null)
        api.success({
          key: 'update-done',
          message: 'Update ready!',
          description: (
            <Button size="small" type="primary" onClick={() => window.leo.updaterInstall()}>
              Restart &amp; Install
            </Button>
          ),
          duration: 0,
        })
      }
      if (event === 'error') console.warn('[updater] error:', data)
    })
    return cleanup
  }, [api])

  function handleAuthenticated(exp?: string) {
    setAuthed(true)
    setExpiresAt(exp ?? null)
  }

  async function handleLogout() {
    await window.leo.authLogout()
    setAuthed(false)
    setExpiresAt(null)
  }

  // Format expiry date nicely
  function formatExpiry(raw?: string | null) {
    if (!raw) return null
    try {
      const d = new Date(raw)
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return raw }
  }

  // Colour the expiry badge by days remaining
  function expiryColor(raw?: string | null): string {
    if (!raw) return '#6b6b9a'
    const diff = (new Date(raw).getTime() - Date.now()) / 86_400_000
    if (diff < 0)   return '#f87171'   // expired
    if (diff < 7)   return '#fb923c'   // < 7 days → orange
    if (diff < 30)  return '#facc15'   // < 30 days → yellow
    return '#4ade80'                    // plenty of time → green
  }

  const expColor  = expiryColor(expiresAt)
  const expFormatted = formatExpiry(expiresAt)

  if (!authed) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#6366f1' } }}>
        <LoginPage onAuthenticated={handleAuthenticated} />
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#6366f1',
          colorBgBase: '#13131f',
          colorBgContainer: '#1c1c2e',
          colorBgElevated: '#24243e',
          borderRadius: 8,
          fontFamily: "'Open Sans', 'Segoe UI', sans-serif",
        },
      }}
    >
      {contextHolder}
      <Layout style={{ height: '100%', minHeight: 600, minWidth: 900, background: '#13131f' }}>
        <Sider
          width={200}
          style={{
            background: '#0f0f1e',
            borderRight: '1px solid #2d2d4e',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Wrap in flex column to push bottom items down */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Logo */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #2d2d4e',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <img
              src="/logo.png"
              alt="Leonardo AI"
              style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', letterSpacing: 0.5 }}>
                Leonardo AI
              </div>
              <div style={{ fontSize: 10, color: '#44446a', marginTop: 1 }}>v{pkg.version}</div>
            </div>
          </div>

          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[page]}
            onClick={({ key }) => setPage(key as any)}
            items={navItems}
            style={{ background: 'transparent', borderRight: 'none', flex: 1 }}
          />

          {/* Bottom: expiry + logout */}
          <div style={{ padding: '0 12px 12px' }}>
            {/* Activation badge — always show when authed */}
            <div style={{
              padding: '7px 10px',
              background: expColor + '15',
              border: `1px solid ${expColor}40`,
              borderRadius: 8,
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, color: '#6b6b9a', marginBottom: 2 }}>Kích hoạt</div>
              {expFormatted ? (
                <>
                  <div style={{ fontSize: 12, color: expColor, fontWeight: 700 }}>{expFormatted}</div>
                  <div style={{ fontSize: 11, color: expColor, opacity: 0.8, marginTop: 2 }}>
                    {(() => {
                      const days = Math.ceil((new Date(expiresAt!).getTime() - Date.now()) / 86_400_000)
                      if (days < 0) return '⛔ Đã hết hạn'
                      if (days === 0) return '⚠️ Hết hạn hôm nay'
                      return `⏳ Còn ${days} ngày`
                    })()}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>Đang hoạt động</div>
              )}
            </div>

            {/* Logout */}
            <Button
              type="text" icon={<LogoutOutlined />} size="small"
              onClick={handleLogout}
              style={{
                width: '100%', color: '#555577',
                display: 'flex', alignItems: 'center',
                justifyContent: 'flex-start', gap: 6,
              }}
            >
              Đăng xuất
            </Button>
          </div>

          {/* Closer tag for the flex column wrapper */}

          {/* Download progress bar */}
          {downloadProgress !== null && (
            <div style={{ padding: '8px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#6b6b9a', marginBottom: 4 }}>
                <CloudDownloadOutlined /> Downloading update…
              </div>
              <Progress percent={downloadProgress} size="small" strokeColor="#6366f1" showInfo={false} />
            </div>
          )}
          </div>{/* end flex column wrapper */}
        </Sider>

        <Content style={{ overflow: 'hidden', padding: 0, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {page === 'cookies'    && <CookiesPage />}
          {page === 'generate'   && <GeneratePage />}
          {page === 'characters' && <CharactersPage />}
        </Content>
      </Layout>
    </ConfigProvider>
  )
}
