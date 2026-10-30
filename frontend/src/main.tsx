import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './ThemeProvider.tsx'
import { ClerkShell } from './components/ClerkShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ClerkShell>
          <App />
        </ClerkShell>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
