import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { LayoutDashboard, Map, Droplets, Package, BookOpen, ShoppingCart, Settings, HelpCircle, LogOut, Bell, Languages, Mic, Plus, ChevronDown, Microscope, MessageSquare } from 'lucide-react'
import './Layout.css'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { path: '/gis', icon: Map, label: 'GIS Mapping' },
  { path: '/irrigation', icon: Droplets, label: 'Irrigation & Climate' },
  { path: '/knowledge', icon: BookOpen, label: 'Knowledge Hub' },
  { path: '/crop-disease', icon: Microscope, label: 'Crop Disease' },
  { path: '/forum', icon: MessageSquare, label: 'Forum' },
]

const languages = [
  { code: 'hi', label: 'हिंदी' },
  { code: 'en', label: 'English' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ' },
  { code: 'mr', label: 'मराठी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'gu', label: 'ગુજરાતી' },
]

export default function Layout({ user, onLogout }) {
  const navigate = useNavigate()
  const [notifications] = useState(3)
  const [langOpen, setLangOpen] = useState(false)
  const [selectedLang, setSelectedLang] = useState('en')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🌾</div>
          <div>
            <div className="logo-title">AgriSense</div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar-sm">{user.name?.[0]?.toUpperCase() || 'A'}</div>
          <div className="user-info-sm">
            <div className="user-name-sm">{user.name || 'Arjun Sharma'}</div>
            <div className="user-role">Digital Agronomist</div>
          </div>
        </div>

        <div className="sidebar-field">
          <div className="field-label">Field Unit</div>
          <div className="field-id">{user.field || 'MPS-01 • Maharashtra'}</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ path, icon: Icon, label, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="btn-primary add-field-btn" style={{ width: '100%', justifyContent: 'center' }}>
            <Plus size={16} /> Add New Field
          </button>
          <div className="sidebar-footer-links">
            <button className="btn-ghost" style={{ width: '100%' }}><Settings size={15} /> Settings</button>
            <button className="btn-ghost" style={{ width: '100%' }}><HelpCircle size={15} /> Support</button>
            <button className="btn-ghost" style={{ width: '100%', color: '#ef4444' }} onClick={onLogout}><LogOut size={15} /> Sign Out</button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-area">
        {/* Top Nav */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              {navItems.find(n => window.location.pathname === n.path || (n.path !== '/' && window.location.pathname.startsWith(n.path)))?.label || 'Command Center'}
            </div>
          </div>
          <div className="topbar-right">
            <div className="search-box">
              <input className="search-input" placeholder="Search Field ID (e.g. F-402)..." />
            </div>
            {/* Language Switcher */}
            <div className="lang-switch" onClick={() => setLangOpen(!langOpen)}>
              <Languages size={18} />
              <span>{languages.find(l => l.code === selectedLang)?.label}</span>
              <ChevronDown size={14} />
              {langOpen && (
                <div className="lang-dropdown">
                  {languages.map(l => (
                    <div key={l.code} className={`lang-option ${l.code === selectedLang ? 'active' : ''}`}
                      onClick={() => { setSelectedLang(l.code); setLangOpen(false) }}>
                      {l.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Notifications */}
            <div className="notif-btn">
              <Bell size={18} />
              {notifications > 0 && <span className="notif-badge">{notifications}</span>}
            </div>
            {/* User */}
            <div className="user-menu" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              <div className="user-avatar">{user.name?.[0]?.toUpperCase() || 'A'}</div>
              {userMenuOpen && (
                <div className="user-dropdown">
                  <div className="user-dropdown-name">{user.name}</div>
                  <div className="user-dropdown-email">{user.email}</div>
                  <hr style={{ borderColor: 'var(--border)', margin: '8px 0' }} />
                  <div className="user-dropdown-item" onClick={onLogout}><LogOut size={13} /> Sign Out</div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
