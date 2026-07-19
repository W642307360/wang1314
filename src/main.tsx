import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import FeishuServiceDesk from './FeishuServiceDesk.tsx'

const Root = location.pathname.startsWith('/feishu-service') ? FeishuServiceDesk : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
