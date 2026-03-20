import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App.tsx'
import { appTheme } from './theme.ts'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={appTheme}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
