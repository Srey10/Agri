import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, MapPin, CheckCircle } from 'lucide-react'
import { registerUser } from '../data/api'
import { indianStates, crops } from '../data/options'
import './Auth.css'


export default function Register({ onLogin }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', farmName: '', state: '', district: '', crop: '', landAcres: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)

  const detectLocation = () => {
    setError('')
    setLocating(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
            const data = await res.json()
            const state = data.address?.state || ''
            const district = data.address?.county || data.address?.city || ''
            setForm(f => ({ ...f, state, district }))
          } catch {
            setError('Could not look up your location. Please select your state and district manually.')
          }
          setLocating(false)
        },
        () => { setError('Location access was denied or unavailable. Please select your state and district manually.'); setLocating(false) }
      )
    } else {
      setError('Location detection is not supported in this browser. Please select your state and district manually.')
      setLocating(false)
    }
  }

  const handleNext = (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password) { setError('Name, email and password are required'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (form.phone.trim() && !/^\+?[0-9][0-9 -]{6,18}$/.test(form.phone.trim())) { setError('Enter a valid mobile number'); return }
    setError('')
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.state || !form.crop) { setError('Select state and crop'); return }
    if (form.landAcres && Number(form.landAcres) <= 0) { setError('Land size must be greater than 0'); return }
    setError('')
    setLoading(true)
    try {
      // Account + farm profile are saved by the backend; the returned user includes the profile.
      const user = await registerUser({
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        phone: form.phone.trim(), farmName: form.farmName.trim(), state: form.state,
        district: form.district.trim(), primaryCrop: form.crop, landAcres: form.landAcres,
      })
      onLogin(user)
    } catch (err) {
      setError(err.message || 'Could not create account. Is the server running?')
      setLoading(false)
    }
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
        <div className="auth-left">
          <div className="auth-logo">
            <div className="auth-logo-icon">🌾</div>
            <span>AgroVista<strong>GIS</strong></span>
          </div>
          <h1 className="auth-hero-title">Join 2.4 Million Indian Farmers</h1>
          <p className="auth-hero-sub">Register your farm, detect your location, and get AI-powered insights for better yields.</p>
          <div className="reg-steps">
            <div className={`reg-step ${step >= 1 ? 'done' : ''}`}><div className="step-num">1</div><div>Personal Info</div></div>
            <div className="step-connector"></div>
            <div className={`reg-step ${step >= 2 ? 'done' : ''}`}><div className="step-num">2</div><div>Farm Details</div></div>
          </div>
          <div className="auth-stats">
            <div className="auth-stat"><div className="auth-stat-num">Free</div><div className="auth-stat-label">Always</div></div>
            <div className="auth-stat"><div className="auth-stat-num">8</div><div className="auth-stat-label">Languages</div></div>
            <div className="auth-stat"><div className="auth-stat-num">24/7</div><div className="auth-stat-label">AI Support</div></div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-form-header">
              <h2>{step === 1 ? 'Create Account 🌱' : 'Farm Details 🚜'}</h2>
              <p>Step {step} of 2</p>
            </div>
            {error && <div className="auth-error">{error}</div>}

            {step === 1 ? (
              <form onSubmit={handleNext} className="auth-form">
                <div className="form-group">
                  <label>Full Name (पूरा नाम)</label>
                  <input className="input" placeholder="Suresh Kumar Yadav" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input className="input" type="email" placeholder="suresh@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Mobile Number (मोबाइल नंबर)</label>
                  <input className="input" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div className="input-icon-wrap">
                    <input className="input" type={showPass ? 'text' : 'password'} placeholder="Min 6 characters"
                      value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                    <button type="button" className="input-icon-btn" onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button className="btn-primary auth-submit" type="submit">Continue →</button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                <button type="button" className="locate-btn" onClick={detectLocation} disabled={locating}>
                  {locating ? <><Loader2 size={14} className="spin-icon" /> Detecting...</> : <><MapPin size={14} /> 📍 Detect My Location</>}
                </button>
                <div className="form-group">
                  <label>Farm Name (खेत का नाम)</label>
                  <input className="input" placeholder="e.g. Green Valley Farm" maxLength={120} value={form.farmName} onChange={e => setForm({ ...form, farmName: e.target.value })} />
                </div>
                <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>State (राज्य)</label>
                    <select className="input" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
                      <option value="">Select State</option>
                      {indianStates.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>District (जिला)</label>
                    <input className="input" placeholder="e.g. Amritsar" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Crop (मुख्य फसल)</label>
                  <select className="input" value={form.crop} onChange={e => setForm({ ...form, crop: e.target.value })}>
                    <option value="">Select Crop</option>
                    {crops.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Land Size (भूमि का आकार) - Acres</label>
                  <input className="input" type="number" min="0" step="any" placeholder="e.g. 5.5 acres" value={form.landAcres} onChange={e => setForm({ ...form, landAcres: e.target.value })} />
                </div>
                <button className="btn-primary auth-submit" type="submit" disabled={loading}>
                  {loading ? <><Loader2 size={16} className="spin-icon" /> Creating account...</> : '✅ Create My Farm Account'}
                </button>
                <button type="button" className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => setStep(1)}>← Back</button>
              </form>
            )}

            <div className="auth-switch">
              Already registered? <Link to="/login">Sign In →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
