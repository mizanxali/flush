import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // The poker engine lives beside this app, shared with the phone app.
  server: { fs: { allow: ['..'] } },
})
