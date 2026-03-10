import { useEffect, useState } from 'react'
import { ConfigProvider, Layout, Menu, theme, notification, Button, Progress } from 'antd'
import { SafetyCertificateOutlined, AppstoreOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import CookiesPage from './pages/CookiesPage'
import GeneratePage from './pages/GeneratePage'
import './App.css'

const { Sider, Content } = Layout

const navItems = [
  { key: 'cookies',  icon: <SafetyCertificateOutlined />, label: 'Cookies' },
  { key: 'generate', icon: <AppstoreOutlined />,           label: 'Generate' },
]

export default function App() {
  const [page, setPage] = useState<'cookies' | 'generate'>('cookies')
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [api, contextHolder] = notification.useNotification()

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
      if (event === 'progress') {
        setDownloadProgress(data)
      }
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
      if (event === 'error') {
        console.warn('[updater] error:', data)
      }
    })
    return cleanup
  }, [api])

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
          }}
        >
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
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#818cf8',
              letterSpacing: 0.5,
            }}>Leonardo AI</span>
          </div>

          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[page]}
            onClick={({ key }) => setPage(key as any)}
            items={navItems}
            style={{ background: 'transparent', borderRight: 'none' }}
          />

          {/* Download progress bar */}
          {downloadProgress !== null && (
            <div style={{ padding: '8px 16px', marginTop: 'auto' }}>
              <div style={{ fontSize: 10, color: '#6b6b9a', marginBottom: 4 }}>
                <CloudDownloadOutlined /> Downloading update…
              </div>
              <Progress percent={downloadProgress} size="small" strokeColor="#6366f1" showInfo={false} />
            </div>
          )}
        </Sider>

        <Content style={{ overflow: 'hidden', padding: 0, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {page === 'cookies'  && <CookiesPage />}
          {page === 'generate' && <GeneratePage />}
        </Content>
      </Layout>
    </ConfigProvider>
  )
}
