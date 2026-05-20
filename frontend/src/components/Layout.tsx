import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CreditCard,
  LogOut,
  Shield,
  Menu,
  X,
} from 'lucide-react'
import { useAppAuth } from '@/auth'
import { useAuthToken } from '@/hooks/useAuth'
import { useMe } from '@/hooks/useMe'

const navItems = [
  { to: '/dashboard', label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/vendors',   label: 'Vendors',      Icon: Users },
  { to: '/profiles',  label: 'Requirements', Icon: ClipboardList },
  { to: '/billing',   label: 'Billing',      Icon: CreditCard },
]

/** Derive a human-readable page title from the current pathname. */
function usePageTitle(): string {
  const { pathname } = useLocation()
  if (pathname.startsWith('/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/vendors') && pathname.split('/').length > 2) return 'Vendor detail'
  if (pathname.startsWith('/vendors')) return 'Vendors'
  if (pathname.startsWith('/profiles')) return 'Requirements'
  if (pathname.startsWith('/billing')) return 'Billing'
  return 'sened'
}

function UserAvatar({ name }: { name?: string | null }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  return (
    <div
      className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-semibold shrink-0"
      title={name ?? undefined}
    >
      {initials}
    </div>
  )
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { logout, user: authUser } = useAppAuth()
  const { data: me } = useMe()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">sened</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-700/80 text-white border-l-2 border-brand-400 pl-[10px]'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white border-l-2 border-transparent pl-[10px]'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-700 shrink-0">
        {me?.organization?.name && (
          <p className="text-xs font-medium text-slate-300 truncate mb-0.5" title={me.organization.name}>
            {me.organization.name}
          </p>
        )}
        <p className="text-xs text-slate-400 truncate mb-3" title={authUser?.email}>
          {authUser?.email}
        </p>
        <button
          onClick={() => logout()}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors py-1 w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  useAuthToken()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pageTitle = usePageTitle()
  const { user: authUser } = useAppAuth()
  const { data: me } = useMe()

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ── Desktop sidebar (always visible ≥ lg) ── */}
      <aside className="hidden lg:flex w-60 bg-slate-900 flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-slate-900 flex flex-col transition-transform duration-200 lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent onClose={() => setDrawerOpen(false)} />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col lg:pl-60 min-w-0">
        {/* Desktop top bar */}
        <header className="hidden lg:flex h-14 bg-white border-b border-gray-200 items-center justify-between px-6 sticky top-0 z-20 shrink-0">
          <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            {me?.organization?.name && (
              <span className="text-sm text-gray-500 font-medium">{me.organization.name}</span>
            )}
            <UserAvatar name={authUser?.name} />
          </div>
        </header>

        {/* Mobile topbar */}
        <header className="lg:hidden h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 sticky top-0 z-20">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-base">sened</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
