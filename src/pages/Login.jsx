import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Leaf, MapPin, Loader2 } from 'lucide-react'
import './Auth.css'

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('Please fill all fields'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 1200))
    const users = JSON.parse(localStorage.getItem('agrovista_users') || '[]')
    const found = users.find(u => u.email === form.email && u.password === form.password)
    if (found) {
      onLogin(found)
    } else {
      // Demo login
      if (form.email === 'arjun@agrovista.in' && form.password === 'farm@123') {
        onLogin({ name: 'Arjun Sharma', email: form.email, field: 'MPS-01 • Maharashtra', role: 'Agronomist' })
      } else {
        setError('Invalid credentials. Try arjun@agrovista.in / farm@123')
      }
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg-overlay"></div>
        <div className="auth-particles">
          {[...Array(20)].map((_, i) => <div key={i} className="particle" style={{ '--delay': `${i * 0.3}s`, '--x': `${Math.random() * 100}%`, '--y': `${Math.random() * 100}%` }} />)}
        </div>
      </div>

      <div className="auth-container fade-in">
        {/* Left Panel */}
        <div className="auth-left">
          <div className="auth-logo">
            <div className="auth-logo-icon">🌾</div>
            <span>AgroVista<strong>GIS</strong></span>
          </div>
          <h1 className="auth-hero-title">India's Digital Agronomy Platform</h1>
          <p className="auth-hero-sub">Smart farming solutions for Indian farmers across Punjab, Maharashtra, Uttar Pradesh, Rajasthan & beyond.</p>
          <div className="auth-features">
            {['🗺️ Live GIS Crop Mapping', '💧 Smart Irrigation Analytics', '🤖 AI Advisory in 8 Languages', '📦 Produce Traceability', '📈 Market Price Intelligence', '🌦️ Real-time Climate Alerts'].map(f => (
              <div key={f} className="auth-feature-item">{f}</div>
            ))}
          </div>
          <div className="auth-stats">
            <div className="auth-stat"><div className="auth-stat-num">2.4M+</div><div className="auth-stat-label">Farmers Served</div></div>
            <div className="auth-stat"><div className="auth-stat-num">18+</div><div className="auth-stat-label">Indian States</div></div>
            <div className="auth-stat"><div className="auth-stat-num">₹840Cr+</div><div className="auth-stat-label">Yield Value</div></div>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-form-header">
              <h2>Welcome Back 🙏</h2>
              <p>Sign in to your AgroVista account</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label>Email Address</label>
                <input className="input" type="email" placeholder="arjun@agrovista.in" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <div className="input-icon-wrap">
                  <input className="input" type={showPass ? 'text' : 'password'} placeholder="Enter password"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                  <button type="button" className="input-icon-btn" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="auth-demo-hint">
                <span>🔑 Demo: </span><code>arjun@agrovista.in</code> / <code>farm@123</code>
              </div>

              <button className="btn-primary auth-submit" type="submit" disabled={loading}>
                {loading ? <><Loader2 size={16} className="spin-icon" /> Signing in...</> : '🚜 Sign In to Dashboard'}
              </button>
            </form>

            <div className="auth-divider"><span>or</span></div>

            <div className="auth-location-hint">
              <MapPin size={14} /> Location detection enabled for field mapping
            </div>

            <div className="auth-switch">
              New to AgroVista? <Link to="/register">Create Account →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
