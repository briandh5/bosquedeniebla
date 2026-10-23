import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import BosqueNiebla from './BosqueNiebla.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BosqueNiebla />
  </StrictMode>
)
