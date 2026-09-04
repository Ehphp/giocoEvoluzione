import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { BUILD_ID } from './app/build-id'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { UiPreview } from './dev/UiPreview.tsx'
import { isUiPreviewRoute } from './dev/ui-preview-route.ts'

import './index.css'

const searchParams = new URLSearchParams(window.location.search)
const uiPreviewRoute = searchParams.get('ui-preview')
const showUiPreview = import.meta.env.DEV && isUiPreviewRoute(uiPreviewRoute)
const rootElement = document.getElementById('root')!

rootElement.dataset.buildId = BUILD_ID

createRoot(rootElement).render(
  <StrictMode>
    {showUiPreview ? <UiPreview route={uiPreviewRoute} /> : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
