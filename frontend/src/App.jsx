import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import Layout from './components/Layout'
import { getToken, clearToken, fetchCurrentUser } from './data/api'
import ChatRoom from './pages/ChatRoom'

function App() {
  // The user always comes from the backend (/auth/me, via the JWT), never from
  // data cached in the browser, so each farmer sees their own profile.
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(() => !!getToken())

  useEffect(() => {
    localStorage.removeItem('agrovista_user') // legacy cached user object
    if (!getToken()) return
    fetchCurrentUser()
      .then(setUser)
      .finally(() => setCheckingSession(false))
  }, [])

  const login = (userData) => setUser(userData)

  const logout = () => {
    clearToken()
    setUser(null)
  }

  if (checkingSession) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading your farm…</div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
        <Route path="/" element={user ? <Layout user={user} onLogout={logout} /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard user={user} />} />
          <Route path="gis" element={<GISMapping user={user} />} />
          <Route path="irrigation" element={<Irrigation user={user} />} />
          <Route path="knowledge" element={<KnowledgeHub user={user} />} />
          <Route path="crop-disease" element={<CropDisease user={user} />} />
          <Route path="forum/chat" element={<ChatRoom user={user} />} />          
          <Route path="forum" element={<Forum user={user} />} />
          <Route path="forum/:id" element={<ForumPost user={user} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
