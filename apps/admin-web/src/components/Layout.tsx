import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth()

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="assets/logo.png" alt="" />
          <span>OpenSpace</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/identities" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Identities
          </NavLink>
          <NavLink to="/rooms" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Rooms
          </NavLink>
          <NavLink to="/invites" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Invites
          </NavLink>
          <NavLink to="/permissions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Permissions
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Settings
          </NavLink>
        </nav>
        <button className="btn-logout" onClick={() => { void logout() }}>
          Log out
        </button>
      </aside>
      <main className="content">
        {children}
      </main>
    </div>
  )
}
