import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App.tsx'

// Offline loading (production builds only). Registered without waiting on it, before the node starts.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(e => console.warn('no offline cache', e))

// No StrictMode: its double-mounted effect would start the durable node twice (one node per account, W8).
createRoot(document.getElementById('root')!).render(<App />)
