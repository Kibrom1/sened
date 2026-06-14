import { useState } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CreditCard,
  LogOut,
  Shield,
  Menu,
  X,
  Zap,
} from 'lucide-react'
import { useAppAuth } from '@/auth'
import { useAuthToken } from '@/hooks/useAuth'
import { useMe } from '@/hooks/useMe'

const TRIAL_DAYS = 14

/** Returns days remaining in trial (0 if expired), or null if not trialing. */
function useTrialDaysRemaining(org: { subscription_status: string; created_at: string } | undefined) {
  if (!org || org.subscription_status !== 'trialing') return null
  const trialEnd = new Date(org.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
  const remaining = Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24)))
  return remaining
}

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
  const trialDaysLeft = useTrialDaysRemaining(me?.organization)

  return (
    <div className="flex flex-col h-full bg-slate-950/90 text-slate-100">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">sened</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Trial countdown */}
      {trialDaysLeft !== null && (
        <div className="mx-4 mb-4 p-4 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2.5 mb-1.5">
            <Zap className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <p className="text-xs font-semibold text-white">
              {trialDaysLeft > 0
                ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial`
                : 'Trial ended'}
            </p>
          </div>
          <p className="text-[11px] text-slate-400 mb-3 leading-snug">
            {trialDaysLeft > 0
              ? 'Upgrade to keep full access.'
              : 'Subscribe to restore access.'}
          </p>
          <Link
            to="/billing"
            onClick={onClose}
            className="block w-full text-center px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            Upgrade now
          </Link>
        </div>
      )}

      {/* User footer */}
      <div className="px-6 py-5 border-t border-slate-800/60 bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-700">
            {me?.organization?.name
              ? me.organization.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
              : '?'}
          </div>
          <div className="min-w-0">
            {me?.organization?.name && (
              <p className="text-xs font-semibold text-white truncate" title={me.organization.name}>
                {me.organization.name}
              </p>
            )}
            <p className="text-[10px] text-slate-400 truncate mt-0.5" title={authUser?.email}>
              {authUser?.email}
            </p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors w-full"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  )
}

/** Account-wide banner for canceled (read-only) and past_due (warning) states. */
function SubscriptionBanner({ status }: { status?: string }) {
  if (status !== 'canceled' && status !== 'past_due') return null

  const isCanceled = status === 'canceled'
  return (
    <div
      className={`px-6 py-3 text-sm font-medium flex items-center justify-between gap-4 border-b ${
        isCanceled
          ? 'bg-red-50 text-red-800 border-red-200'
          : 'bg-amber-50 text-amber-800 border-amber-200'
      }`}
    >
      <span>
        {isCanceled
          ? 'Your subscription is canceled — your account is read-only. Re-subscribe to make changes.'
          : 'Your last payment failed. Please update your payment method to avoid interruption.'}
      </span>
      <Link
        to="/billing"
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${
          isCanceled ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
        }`}
      >
        {isCanceled ? 'Re-subscribe' : 'Update payment'}
      </Link>
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
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Desktop sidebar (always visible ≥ lg) ── */}
      <aside className="hidden lg:flex w-64 bg-slate-950 border-r border-slate-800/30 flex-col fixed inset-y-0 left-0 z-30 shadow-premium">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-all duration-300"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-950 flex flex-col border-r border-slate-800 transition-transform duration-300 ease-out lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent onClose={() => setDrawerOpen(false)} />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Desktop top bar */}
        <header className="hidden lg:flex h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 items-center justify-between px-8 sticky top-0 z-20 shrink-0">
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">{pageTitle}</h1>
          <div className="flex items-center gap-4">
            {me?.organization?.name && (
              <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">{me.organization.name}</span>
            )}
            <UserAvatar name={authUser?.name} />
          </div>
        </header>

        {/* Mobile topbar */}
        <header className="lg:hidden h-16 bg-white border-b border-slate-200/80 flex items-center px-4 gap-3 sticky top-0 z-20 shrink-0 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold text-slate-800 tracking-tight truncate">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <UserAvatar name={authUser?.name} />
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50/50">
          <SubscriptionBanner status={me?.organization?.subscription_status} />
          <div className="animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
