import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import { reloadForStaleBuild } from '@/lib/staleReload'

// Vite fires this when a lazy chunk fails to load — almost always because a new
// build replaced the chunk names the current page references. Reload once
// (time-guarded) to pull the fresh build instead of crashing to the error UI.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadForStaleBuild()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
