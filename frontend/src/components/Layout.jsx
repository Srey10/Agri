/* eslint-disable no-unused-vars */
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard,
  Map,
  Droplets,
  BookOpen,
  Settings,
  HelpCircle,
  LogOut,
  Bell,
  Languages,
  Plus,
  ChevronDown,
  Microscope,
  MessageSquare,
  Menu,
  X
} from 'lucide-react'

import { getFarmInfo } from '../data/farm'
import './Layout.css'

const navItems = [
  {
    path: '/',
    icon: LayoutDashboard,
    label: 'Dashboard',
    exact: true
  },
  {
    path: '/gis',
    icon: Map,
    label: 'GIS Mapping'
  },
  {
    path: '/irrigation',
    icon: Droplets,
    label: 'Irrigation & Climate'
  },
  {
    path: '/knowledge',
    icon: BookOpen,
    label: 'Knowledge Hub'
  },
  {
    path: '/crop-disease',
    icon: Microscope,
    label: 'Crop Disease'
  },
  {
    path: '/forum',
    icon: MessageSquare,
    label: 'Forum'
  }
]

const languages = [
  {
    code: 'hi',
    label: 'हिंदी'
  },
  {
    code: 'en',
    label: 'English'
  },
  {
    code: 'mr',
    label: 'मराठी'
  }
]

export default function Layout({ user, activeFieldId, onSelectField, onLogout }) {
  const navigate = useNavigate()
  const fields = user.fields || []
  const activeField = fields.find(f => f.id === activeFieldId) || null
  const farm = getFarmInfo(user, activeField)

  const [notifications] = useState(3)

  const [langOpen, setLangOpen] = useState(false)

  const [selectedLang, setSelectedLang] = useState(
    localStorage.getItem('agri-language') || 'en'
  )

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Change website language
  const changeLanguage = (lang) => {
    setSelectedLang(lang)

    localStorage.setItem('agri-language', lang)

    // Find Google Translate's hidden language selector
    const select = document.querySelector('.goog-te-combo')

    if (select) {
      select.value = lang

      select.dispatchEvent(
        new Event('change', {
          bubbles: true
        })
      )
    }
  }

  return (
    <div className="layout">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>

        <div className="sidebar-logo">
          <div className="logo-icon">🌾</div>

          <div style={{ flex: 1 }}>
            <div className="logo-title">
              AgriSense
            </div>
          </div>

          <button
            className="mobile-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-user">

          <div className="user-avatar-sm">
            {user.name?.[0]?.toUpperCase() || '?'}
          </div>

          <div className="user-info-sm">

            <div className="user-name-sm">
              {user.name}
            </div>

            <div className="user-role">
              {user.role === 'admin' ? 'Admin' : 'Farmer'}
            </div>

          </div>

        </div>

        <div className="sidebar-field">

          <div className="field-label">
            {farm.farmName}
          </div>

          <select
            className="field-select"
            aria-label="Select field"
            value={activeFieldId ?? ''}
            onChange={e => { onSelectField(Number(e.target.value)); setSidebarOpen(false) }}
          >
            {fields.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}{f.areaHectares != null ? ` · ${f.areaHectares.toFixed(2)} ha` : ''}
              </option>
            ))}
          </select>

          {farm.fieldId && (
            <div className="field-id">
              ID {farm.fieldId} · {fields.length} {fields.length === 1 ? 'field' : 'fields'}
            </div>
          )}

        </div>

        <nav className="sidebar-nav">

          {navItems.map(
            ({ path, icon: Icon, label, exact }) => (

              <NavLink
                key={path}
                to={path}
                end={exact}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
              >

                <Icon size={18} />

                <span>
                  {label}
                </span>

              </NavLink>

            )
          )}

        </nav>

        <div className="sidebar-bottom">

          <button
            className="btn-primary add-field-btn"
            style={{
              width: '100%',
              justifyContent: 'center'
            }}
            onClick={() => { setSidebarOpen(false); navigate('/farm-mapping?new=1') }}
          >
            <Plus size={16} />

            Add New Field
          </button>

          <div className="sidebar-footer-links">

            <button
              className="btn-ghost"
              style={{
                width: '100%'
              }}
              onClick={() => { setSidebarOpen(false); navigate('/profile') }}
            >
              <Settings size={15} />

              Profile & Settings
            </button>

            <button
              className="btn-ghost"
              style={{
                width: '100%'
              }}
            >
              <HelpCircle size={15} />

              Support
            </button>

            <button
              className="btn-ghost"
              style={{
                width: '100%',
                color: '#ef4444'
              }}
              onClick={onLogout}
            >
              <LogOut size={15} />

              Sign Out
            </button>

          </div>

        </div>

      </aside>


      {/* Main Area */}
      <div className="main-area">

        {/* Top Nav */}
        <header className="topbar">

          <div className="topbar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

            <div className="topbar-breadcrumb">

              {
                navItems.find(
                  n =>
                    window.location.pathname === n.path ||
                    (
                      n.path !== '/' &&
                      window.location.pathname.startsWith(n.path)
                    )
                )?.label || 'Command Center'
              }

            </div>

          </div>


          <div className="topbar-right">

            {/* Search */}
            <div className="search-box">

              <input
                className="search-input"
                placeholder="Search..."
              />

            </div>


            {/* Language Switcher */}
            <div
              className="lang-switch"
              onClick={() => setLangOpen(!langOpen)}
            >

              <Languages size={18} />

              <span>
                {
                  languages.find(
                    l => l.code === selectedLang
                  )?.label
                }
              </span>

              <ChevronDown size={14} />


              {langOpen && (

                <div
                  className="lang-dropdown"
                  onClick={e => e.stopPropagation()}
                >

                  {languages.map(l => (

                    <div
                      key={l.code}
                      className={`lang-option ${
                        l.code === selectedLang
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => {
                        changeLanguage(l.code)
                        setLangOpen(false)
                      }}
                    >

                      {l.label}

                    </div>

                  ))}

                </div>

              )}

            </div>


            {/* Notifications */}
            <div className="notif-btn">

              <Bell size={18} />

              {notifications > 0 && (

                <span className="notif-badge">
                  {notifications}
                </span>

              )}

            </div>


            {/* User */}
            <div
              className="user-menu"
              onClick={() =>
                setUserMenuOpen(!userMenuOpen)
              }
            >

              <div className="user-avatar">
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>


              {userMenuOpen && (

                <div className="user-dropdown">

                  <div className="user-dropdown-name">
                    {user.name}
                  </div>

                  <div className="user-dropdown-email">
                    {user.email}
                  </div>

                  <hr
                    style={{
                      borderColor: 'var(--border)',
                      margin: '8px 0'
                    }}
                  />

                  <div
                    className="user-dropdown-item"
                    onClick={() => navigate('/profile')}
                  >

                    <Settings size={13} />

                    Profile

                  </div>

                  <div
                    className="user-dropdown-item"
                    onClick={onLogout}
                  >

                    <LogOut size={13} />

                    Sign Out

                  </div>

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