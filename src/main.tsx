import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { UiPreview } from './dev/UiPreview.tsx'
import { isUiPreviewRoute } from './dev/ui-preview-route.ts'

const searchParams = new URLSearchParams(window.location.search)
const uiPreviewRoute = searchParams.get('ui-preview')
const showUiPreview = import.meta.env.DEV && isUiPreviewRoute(uiPreviewRoute)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showUiPreview ? <UiPreview route={uiPreviewRoute} /> : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
