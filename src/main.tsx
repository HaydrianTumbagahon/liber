import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LayoutGroup } from 'framer-motion'
import { BrowserRouter } from 'react-router-dom'
import { StatusBannerProvider } from './components/ui/StatusBanner.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'
import { LenisProvider } from './lib/LenisProvider.tsx'
import { SettingsProvider } from './lib/theme.tsx'
import './styles/index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <LenisProvider>
          <LayoutGroup id="liber-app">
            <ToastProvider>
              <StatusBannerProvider>
                <App />
              </StatusBannerProvider>
            </ToastProvider>
          </LayoutGroup>
        </LenisProvider>
      </BrowserRouter>
    </SettingsProvider>
  </StrictMode>,
)
