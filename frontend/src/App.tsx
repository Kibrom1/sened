import { Routes, Route, Navigate } from 'react-router-dom'
import { useAppAuth } from '@/auth'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import VendorsPage from '@/pages/Vendors'
import VendorDetailPage from '@/pages/VendorDetail'
import UploadPage from '@/pages/Upload'
import ProfilesPage from '@/pages/RequirementProfiles'
import RenewalsPage from '@/pages/Renewals'
import BillingPage from '@/pages/Billing'
import MagicUploadPage from '@/pages/MagicUpload'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Shield } from 'lucide-react'

function AuthErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-card p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Authentication error</h2>
        <p className="text-sm text-gray-500 mb-6">
          There was a problem signing you in. Please try again — if the issue persists, contact support.
        </p>
        <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded-lg px-3 py-2 mb-6 break-all">
          {message}
        </p>
        <button
          onClick={() => window.location.href = '/login'}
          className="btn-primary mx-auto"
        >
          Back to sign in
        </button>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, error } = useAppAuth()

  if (isLoading) return <LoadingSpinner fullScreen />
  if (error) return <AuthErrorScreen message={error.message} />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/magic-upload/:token" element={<MagicUploadPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="vendors/:vendorId" element={<VendorDetailPage />} />
        <Route path="vendors/:vendorId/upload" element={<UploadPage />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="renewals" element={<RenewalsPage />} />
        <Route path="billing" element={<BillingPage />} />
      </Route>
    </Routes>
  )
}
