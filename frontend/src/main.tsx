import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@qvanderlinden/ui/fonts.css'
import { Toaster } from '@qvanderlinden/ui'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
)
