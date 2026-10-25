import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@qvanderlinden/ui/fonts.css'
import { Toaster } from '@qvanderlinden/ui'
import { AuthGate } from '@qvanderlinden/auth-ui'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate apiBase="/api/auth">
      <App />
    </AuthGate>
    <Toaster />
  </StrictMode>,
)
