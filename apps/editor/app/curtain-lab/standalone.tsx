import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CurtainPreview from './preview'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CurtainPreview />
  </StrictMode>,
)
