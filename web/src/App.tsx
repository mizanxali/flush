// Spike: link to a phone host over Web Bluetooth, join its group, exchange messages.
import { useEffect, useRef, useState } from 'react'
import { APP_ID, loadSdk, type BluetoothCarrier, type EngineEvent, type OfflineNode } from './sdk'

const NOISY = new Set(['diagnostic', 'network_metrics', 'convergence_diag', 'peer_rssi'])
const profile = new URLSearchParams(location.search).get('profile') ?? 'me'

export default function App() {
  const node = useRef<OfflineNode | null>(null)
  const carrier = useRef<BluetoothCarrier | null>(null)
  const [address, setAddress] = useState('starting…')
  const [phones, setPhones] = useState<string[]>([])
  const [log, setLog] = useState<string[]>([])
  const say = (line: string) => setLog(l => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 300))

  useEffect(() => {
    let stopped = false
    ;(async () => {
      const { OfflineNode, BluetoothCarrier } = await loadSdk()
      if (!BluetoothCarrier.supported) say('no Web Bluetooth in this browser: use Chrome')
      const n = await OfflineNode.start({ appId: APP_ID, profile, ble: true, tabs: false })
      if (stopped) return n.stop()
      node.current = n
      setAddress(n.address)
      n.addEventListener('event', (e: Event) => {
        const ev = (e as CustomEvent<EngineEvent>).detail
        if (!NOISY.has(ev.type)) say(`${ev.type} ${JSON.stringify(ev)}`)
      })
      n.addEventListener('fatal', (e: Event) => say(`FATAL ${JSON.stringify((e as CustomEvent).detail)}`))
      const c = new BluetoothCarrier(n)
      c.addEventListener('connection', () => setPhones([...c.peers]))
      carrier.current = c
    })().catch(err => say(`start failed: ${err}`))
    return () => {
      stopped = true
      node.current?.stop()
    }
  }, [])

  const connect = () =>
    carrier.current
      ?.request()
      .then(peer => say(`linked ${peer}`))
      .catch(err => say(`link failed: ${err}`))

  const ping = () =>
    phones.forEach(p =>
      node.current
        ?.sendMessage(p, JSON.stringify({ t: 'ping', from: profile, at: Date.now() }))
        .then(id => say(`sent ping ${id}`))
        .catch(err => say(`send failed: ${err}`)),
    )

  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: 24, color: '#ddd', background: '#1b1b1b', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'system-ui', margin: 0 }}>flush · spike</h1>
      <p>
        {profile} · {address}
      </p>
      <p>phones: {phones.join(', ') || 'none'}</p>
      <button onClick={connect}>Connect to phone</button> <button onClick={ping} disabled={!phones.length}>Ping host</button>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{log.join('\n')}</pre>
    </main>
  )
}
