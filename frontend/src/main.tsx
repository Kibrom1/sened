import React from 'react'
import ReactDOM from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { DevAuthProvider, IS_DEV_MODE } from '@/auth'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const AUTH0_DOMAIN    = import.meta.env.VITE_AUTH0_DOMAIN    || ''
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || ''
const AUTH0_AUDIENCE  = import.meta.env.VITE_AUTH0_AUDIENCE  || ''

function AuthProvider({ children }: { children: React.ReactNode }) {
  if (IS_DEV_MODE) {
    return <DevAuthProvider>{children}</DevAuthProvider>
  }
  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: AUTH0_AUDIENCE,
      }}
    >
      {children}
    </Auth0Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
          <Toaster position="bottom-right" richColors closeButton />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  </React.StrictMode>,
)
