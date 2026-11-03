import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import GISMapping from './pages/GISMapping'
import Irrigation from './pages/Irrigation'
import KnowledgeHub from './pages/KnowledgeHub'
import CropDisease from './pages/CropDisease'
import Forum from './pages/Forum'
import ForumPost from './pages/ForumPost'
import FarmMapping from './pages/FarmMapping'
import Profile from './pages/Profile'
import Layout from './components/Layout'
import { getToken, clearToken, fetchCurrentUser } from './data/api'
import { pickActiveFieldId, rememberActiveFieldId } from './data/farm'

// Remount the mapping page when switching between "add field" and "edit field" (?new=1 / ?field=<id>)
function FarmMappingRoute(props) {
  const { search } = useLocation()
  return <FarmMapping key={search} {...props} />
}

function App() {
  // The user always comes from the backend (/auth/me, via the JWT), never from
  // data cached in the browser, so each farmer sees their own profile and fields.
  const [user, setUser] = useState(null)
  const [activeFieldId, setActiveFieldId] = useState(null)
  const [checkingSession, setCheckingSession] = useState(() => !!getToken())

  // Store a (re)loaded user and decide which of their fields is selected.
  // The remembered field id is only a UI preference; it is checked against the server's list.
  const applyUser = (u, preferredFieldId = null) => {
    setUser(u)
    if (!u) { setActiveFieldId(null); return }
    const chosen = u.fields?.some(f => f.id === preferredFieldId) ? preferredFieldId : pickActiveFieldId(u)
    if (chosen) rememberActiveFieldId(u.id, chosen)
    setActiveFieldId(chosen)
  }

  useEffect(() => {
    localStorage.removeItem('agrovista_user') // legacy cached user object
    if (!getToken()) return
    fetchCurrentUser()
      .then(u => applyUser(u))
      .finally(() => setCheckingSession(false))
  }, [])

  const login = (userData) => applyUser(userData)
  const saveUser = (u, preferredFieldId = activeFieldId) => applyUser(u, preferredFieldId)
  const selectField = (id) => applyUser(user, id)

  const logout = () => {
    clearToken()
    applyUser(null)
  }

  if (checkingSession) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading your farm…</div>
  }

  const activeField = user?.fields?.find(f => f.id === activeFieldId) || null
  // A farmer must have a name and at least one mapped field. Everything is derived from the
  // server's user object, so refreshing or typing a URL cannot skip these steps.
  const needsName = !!user && !user.name?.trim()
  const needsMapping = !!user && !needsName && !activeField
  const fieldKey = activeField?.id

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
        <Route
          path="/profile"
          element={user ? <Profile user={user} onUserUpdated={(u) => saveUser(u)} onLogout={logout} /> : <Navigate to="/login" />}
        />
        <Route
          path="/farm-mapping"
          element={
            !user ? <Navigate to="/login" />
              : needsName ? <Navigate to="/profile" replace />
                : <FarmMappingRoute user={user} activeFieldId={activeFieldId} onSaved={saveUser} onLogout={logout} />
          }
        />
        <Route
          path="/"
          element={
            !user ? <Navigate to="/login" />
              : needsName ? <Navigate to="/profile" replace />
                : needsMapping ? <Navigate to="/farm-mapping" replace />
                  : <Layout user={user} activeFieldId={activeFieldId} onSelectField={selectField} onLogout={logout} />
          }
        >
          <Route index element={<Dashboard key={fieldKey} user={user} field={activeField} />} />
          <Route path="gis" element={<GISMapping key={fieldKey} user={user} field={activeField} />} />
          <Route path="irrigation" element={<Irrigation key={fieldKey} user={user} field={activeField} />} />
          <Route path="knowledge" element={<KnowledgeHub user={user} />} />
          <Route path="crop-disease" element={<CropDisease user={user} field={activeField} />} />
          <Route path="forum" element={<Forum user={user} />} />
          <Route path="forum/:id" element={<ForumPost user={user} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
