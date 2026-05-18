import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function LoginPage() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  if (isLoading) return <LoadingSpinner fullScreen />

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">sened</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Automated certificate of insurance tracking for businesses that manage subcontractors.
        </p>
        <button
          onClick={() => loginWithRedirect()}
          className="w-full bg-brand-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-brand-700 transition-colors"
        >
          Sign in / Sign up
        </button>
      </div>
    </div>
  )
}
