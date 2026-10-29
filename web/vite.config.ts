import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Writes dist/sw.js with every built file precached under an id derived from their contents. */
function serviceWorker(): Plugin {
  return {
    name: 'flush-sw',
    apply: 'build',
    closeBundle() {
      const dist = join(__dirname, 'dist')
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
      const files = walk(dist).filter(f => !f.endsWith('sw.js') && !f.endsWith('.d.ts'))
      const template = readFileSync(join(__dirname, 'sw.js'), 'utf8')
      const hash = createHash('sha256').update(template)
      for (const f of files.sort()) hash.update(f).update(readFileSync(f))
      const assets = files.map(f => '/' + relative(dist, f).split('\\').join('/'))
      const sw = template.replace('__BUILD__', hash.digest('hex').slice(0, 12)).replace('__ASSETS__', JSON.stringify(assets))
      writeFileSync(join(dist, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // The poker engine lives beside this app, shared with the phone app.
  server: { fs: { allow: ['..'] } },
})
