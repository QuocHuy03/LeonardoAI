import { useState, useEffect } from 'react'
import { Button, Input, Typography, message, Spin } from 'antd'
import { KeyOutlined, SafetyCertificateOutlined, LaptopOutlined } from '@ant-design/icons'

const { Text, Title } = Typography

interface LoginPageProps {
  onAuthenticated: (expiresAt?: string) => void
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [deviceId, setDeviceId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // On mount: auto-verify if key already stored
  useEffect(() => {
    if (!window.leo) { setChecking(false); return }
    window.leo.authGetDeviceId().then(id => setDeviceId(id)).catch(() => {})
    window.leo.authVerify().then(res => {
      if (res.success) onAuthenticated(res.expires_at)
      else setChecking(false)
    }).catch(() => setChecking(false))
  }, [])

  async function handleLogin() {
    if (!key.trim()) return message.warning('Nhập license key')
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await window.leo.authLogin(key.trim())
      if (res.success) {
        message.success('Xác thực thành công!')
        onAuthenticated(res.expires_at)
      } else {
        setErrorMsg(res.error ?? 'Key không hợp lệ hoặc đã hết hạn')
      }
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={styles.root}>
        <Spin size="large" />
        <Text style={{ color: '#6b6b9a', marginTop: 16 }}>Đang xác thực…</Text>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      {/* Glow blobs */}
      <div style={styles.blob1} />
      <div style={styles.blob2} />

      <div style={styles.card}>

        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={styles.iconWrap}>
            <SafetyCertificateOutlined style={{ fontSize: 32, color: '#818cf8' }} />
          </div>
          <Title level={3} style={{ color: '#e8e8ff', margin: '14px 0 4px', fontFamily: 'Inter, sans-serif' }}>
            Leonardo AI Tool
          </Title>
          <Text style={{ color: '#6b6b9a', fontSize: 13 }}>
            Nhập license key để sử dụng
          </Text>
        </div>

        {/* Input */}
        <Input.Password
          placeholder="KEY-XXXXXXXXXXXXXXXXX"
          value={key}
          onChange={e => setKey(e.target.value)}
          onPressEnter={handleLogin}
          prefix={<KeyOutlined style={{ color: '#4f4f7f' }} />}
          style={styles.input}
          size="large"
        />

        {/* Error */}
        {errorMsg && (
          <div style={styles.errorBox}>
            {errorMsg}
          </div>
        )}

        {/* Login button */}
        <Button
          type="primary" block size="large"
          loading={loading}
          onClick={handleLogin}
          style={styles.btn}
        >
          Kích hoạt
        </Button>

        {/* Device ID */}
        {deviceId && (
          <div style={styles.deviceBox}>
            <LaptopOutlined style={{ marginRight: 6, color: '#4f4f7f' }} />
            <Text style={{ color: '#4f4f7f', fontSize: 11, fontFamily: 'monospace' }}>
              Device: {deviceId.slice(0, 24)}…
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#0a0a14', position: 'relative', overflow: 'hidden',
  },
  blob1: {
    position: 'absolute', width: 400, height: 400, borderRadius: '50%',
    background: 'radial-gradient(circle, #4f46e540 0%, transparent 70%)',
    top: '-100px', left: '-100px', pointerEvents: 'none',
  },
  blob2: {
    position: 'absolute', width: 350, height: 350, borderRadius: '50%',
    background: 'radial-gradient(circle, #7c3aed30 0%, transparent 70%)',
    bottom: '-80px', right: '-80px', pointerEvents: 'none',
  },
  card: {
    position: 'relative', zIndex: 1,
    width: 380, padding: '36px 32px',
    background: 'rgba(20, 20, 40, 0.85)',
    border: '1px solid #2d2d4e',
    borderRadius: 20,
    backdropFilter: 'blur(20px)',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  iconWrap: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 64, height: 64, borderRadius: 14,
    background: 'linear-gradient(135deg, #1e1e3f, #2d2d5e)',
    border: '1px solid #3d3d6e',
    boxShadow: '0 8px 24px rgba(79,70,229,0.3)',
  },
  input: {
    background: '#13131f', borderColor: '#3d3d6e',
    marginBottom: 14, borderRadius: 10,
  },
  errorBox: {
    background: '#2d1414', border: '1px solid #5a2020',
    borderRadius: 8, padding: '8px 12px',
    color: '#f87171', fontSize: 12, marginBottom: 14,
    lineHeight: 1.5,
  },
  btn: {
    background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
    border: 'none', height: 44, borderRadius: 10,
    fontWeight: 700, fontSize: 15,
    boxShadow: '0 4px 20px rgba(79,70,229,0.4)',
    marginBottom: 20,
  },
  deviceBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    paddingTop: 12, borderTop: '1px solid #1c1c30',
  },
}
