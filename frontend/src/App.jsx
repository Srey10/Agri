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

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('agrovista_user')
    return saved ? JSON.parse(saved) : null
  })

  const login = (userData) => {
    localStorage.setItem('agrovista_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('agrovista_user')
    setUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
        <Route path="/" element={user ? <Layout user={user} onLogout={logout} /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard user={user} />} />
          <Route path="gis" element={<GISMapping user={user} />} />
          <Route path="knowledge" element={<KnowledgeHub user={user} />} />
          <Route path="crop-disease" element={<CropDisease user={user} />} />
          <Route path="forum" element={<Forum user={user} />} />
          <Route path="forum/:id" element={<ForumPost user={user} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
