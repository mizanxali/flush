import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: its double-mounted effect would start the durable node twice (one node per account, W8).
createRoot(document.getElementById('root')!).render(<App />)
