import { useAuth0 } from '@auth0/auth0-react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import VendorsPage from '@/pages/Vendors'
import VendorDetailPage from '@/pages/VendorDetail'
import UploadPage from '@/pages/Upload'
import ProfilesPage from '@/pages/RequirementProfiles'
import MagicUploadPage from '@/pages/MagicUpload'
import LoadingSpinner from '@/components/LoadingSpinner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, error } = useAuth0()
  
  if (isLoading) return <LoadingSpinner fullScreen />
  if (error) return <div className="p-8 text-red-600 bg-red-50 font-mono text-sm break-all">Auth Error: {error.message}</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/upload/:token" element={<MagicUploadPage />} />

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
      </Route>
    </Routes>
  )
}
