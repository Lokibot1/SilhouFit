import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

// Plugins load only inside the native shell, so they stay out of the web bundle.
if (Capacitor.isNativePlatform()) void import('./native')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <CookieConsentProvider>
          <App />
        </CookieConsentProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
