import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LogOut, Save, CheckCircle } from 'lucide-react'
import { updateProfile } from '../data/api'
import { indianStates, crops } from '../data/options'
import './FarmMapping.css'
import './Profile.css'

const fromUser = (user) => ({
  name: user?.name || '',
  phone: user?.profile?.phone || '',
  farmName: user?.profile?.farmName || '',
  state: user?.profile?.state || '',
  district: user?.profile?.district || '',
  primaryCrop: user?.profile?.primaryCrop || '',
  landAcres: user?.profile?.landAcres ?? '',
})

// Edit the farmer's own name and farm details. Saved through PUT /farmer/profile (JWT user only).
export default function Profile({ user, onUserUpdated, onLogout }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => fromUser(user))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const nameMissing = !user?.name?.trim()
  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setSaved(false); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Please enter your name.'); return }
    if (form.landAcres !== '' && Number(form.landAcres) <= 0) { setError('Land size must be greater than 0.'); return }
    setSaving(true)
    setError('')
    try {
      const data = await updateProfile({
        name: form.name.trim(), phone: form.phone.trim(), farmName: form.farmName.trim(),
        state: form.state, district: form.district.trim(), primaryCrop: form.primaryCrop, landAcres: form.landAcres,
      })
      onUserUpdated(data.user)
      setSaved(true)
      if (nameMissing) navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not save your profile. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div className="fm-page">
      <header className="fm-header">
        <div className="fm-brand">🌾 AgriSense</div>
        <div className="fm-header-actions">
          {!nameMissing && <button type="button" className="btn-ghost" onClick={() => navigate('/')}>← Back</button>}
          <button type="button" className="btn-ghost fm-logout" onClick={onLogout}><LogOut size={15} /> Sign Out</button>
        </div>
      </header>

      <form className="card profile-card" onSubmit={submit}>
        <h1 className="fm-title">{nameMissing ? 'Please complete your profile' : 'Your profile'}</h1>
        <p className="fm-lead">
          {nameMissing ? 'We need your name before you continue.' : 'Update your details. Your email cannot be changed here.'}
        </p>

        <div className="form-group">
          <label htmlFor="pf-name">Full name</label>
          <input id="pf-name" className="input" value={form.name} maxLength={100} onChange={set('name')} autoFocus={nameMissing} />
        </div>
        <div className="form-group">
          <label htmlFor="pf-email">Email</label>
          <input id="pf-email" className="input" value={user?.email || ''} disabled />
        </div>
        <div className="form-group">
          <label htmlFor="pf-phone">Mobile number</label>
          <input id="pf-phone" className="input" type="tel" value={form.phone} onChange={set('phone')} />
        </div>
        <div className="form-group">
          <label htmlFor="pf-farm">Farm name</label>
          <input id="pf-farm" className="input" value={form.farmName} maxLength={120} onChange={set('farmName')} />
        </div>
        <div className="profile-grid">
          <div className="form-group">
            <label htmlFor="pf-state">State</label>
            <select id="pf-state" className="input" value={form.state} onChange={set('state')}>
              <option value="">Select State</option>
              {indianStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pf-district">District</label>
            <input id="pf-district" className="input" value={form.district} onChange={set('district')} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="pf-crop">Primary crop</label>
          <select id="pf-crop" className="input" value={form.primaryCrop} onChange={set('primaryCrop')}>
            <option value="">Select Crop</option>
            {crops.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="pf-acres">Total land size (acres)</label>
          <input id="pf-acres" className="input" type="number" min="0" step="any" value={form.landAcres} onChange={set('landAcres')} />
        </div>

        {error && <div className="fm-msg fm-msg-error" role="alert">{error}</div>}
        {saved && <div className="fm-msg fm-msg-info" role="status"><CheckCircle size={14} /> Saved.</div>}

        <button type="submit" className="btn-primary fm-big-btn" disabled={saving}>
          {saving ? <><Loader2 size={18} className="spin-icon" /> Saving…</> : <><Save size={18} /> Save profile</>}
        </button>
      </form>
    </div>
  )
}
