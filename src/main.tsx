import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { GameLayoutAuditScreen } from './components/game-v2/GameLayoutAuditScreen.tsx'

const showLayoutAudit = import.meta.env.DEV && new URLSearchParams(window.location.search).has('layout-audit')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showLayoutAudit ? <GameLayoutAuditScreen /> : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
