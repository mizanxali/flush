import { useEffect, useReducer, useState } from 'react'
import { AVATARS } from '../../engine/avatar.ts'
import { DEFAULTS, Guest, Host, stakes, type Me } from '../../engine/session.ts'
import { Net } from './net'
import { GuestPair, HostPair } from './Pair'
import { Table, type Controls } from './Table'
import { Avatar, Logo } from './ui'

const profile = new URLSearchParams(location.search).get('profile') ?? 'me'
const STAKES = [
  [10, 20],
  [25, 50],
  [100, 200],
  [200, 500],
]

type Mode = { k: 'home' } | { k: 'host'; host: Host } | { k: 'join'; guest: Guest }

function loadMe(): Omit<Me, 'id'> {
  try {
    const m = JSON.parse(localStorage.getItem(`flush.me.${profile}`) ?? '')
    if (typeof m.name === 'string' && Number.isInteger(m.avatar)) return m
  } catch {
    /* first visit */
  }
  return { name: `Player ${1000 + Math.floor(Math.random() * 9000)}`, avatar: Math.floor(Math.random() * AVATARS) }
}

export default function App() {
  const [net, setNet] = useState<Net | null>(null)
  const [error, setError] = useState('')
  const [me, setMe] = useState(loadMe)
  const [mode, setMode] = useState<Mode>({ k: 'home' })
  const [pair, setPair] = useState<'host' | 'guest' | null>(null)
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    // One node per page: hot reloads in development re-run this effect in the same page.
    const g = globalThis as { flushNet?: Promise<Net> }
    ;(g.flushNet ??= Net.start(profile)).then(setNet, e => setError(String(e?.message ?? e)))
  }, [])
  useEffect(() => localStorage.setItem(`flush.me.${profile}`, JSON.stringify(me)), [me])
  useEffect(() => {
    if (!net) return
    net.listener = mode.k === 'host' ? mode.host : mode.k === 'join' ? mode.guest : null
    return () => {
      net.listener = null
    }
  }, [net, mode])

  const identity = (): Me => ({ id: net!.address, name: me.name.trim() || 'Player', avatar: me.avatar })

  const host = (name: string, sb: number, bb: number, bbs: number) => {
    const h: Host = new Host(net!, { name, sb, bb, buyIn: bb * bbs, ...DEFAULTS }, identity(), bump, net!.peers)
    setMode({ k: 'host', host: h })
  }
  const join = () => setMode({ k: 'join', guest: new Guest(net!, identity(), bump, net!.peers) })

  let screen: React.ReactNode
  if (error) screen = <p className="error pad">The network node did not start: {error}</p>
  else if (!net) screen = <p className="muted pad">Starting…</p>
  else if (mode.k === 'host') {
    const h = mode.host
    const c: Controls = {
      act: h.act,
      rebuy: h.rebuyMe,
      sit: h.sitMe,
      start: () => h.start(),
      addBrowser: () => setPair('host'),
      leave: () => {
        if (!confirm('Close the table for everyone?')) return
        h.close()
        setMode({ k: 'home' })
      },
    }
    screen = <Table v={h.view} c={c} />
  } else if (mode.k === 'join' && mode.guest.view) {
    const g = mode.guest
    const c: Controls = {
      act: g.act,
      rebuy: g.rebuyMe,
      sit: g.sitMe,
      leave: () => confirm('Leave the table?') && g.leaveTable(),
      banner: g.hostLost ? 'Lost the connection to the host. Reconnecting…' : null,
    }
    screen = <Table v={g.view!} c={c} />
  } else if (mode.k === 'join') {
    screen = <JoinScreen net={net} guest={mode.guest} onBack={() => setMode({ k: 'home' })} onCode={() => setPair('guest')} />
  } else {
    screen = <Home me={me} setMe={setMe} onHost={host} onJoin={join} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <span className="muted small">{net ? '● Offline ready' : ''}</span>
      </header>
      {screen}
      {net && pair === 'host' && <HostPair net={net} onClose={() => setPair(null)} />}
      {net && pair === 'guest' && <GuestPair net={net} onClose={() => setPair(null)} />}
    </div>
  )
}

function Home({ me, setMe, onHost, onJoin }: { me: Omit<Me, 'id'>; setMe: (m: Omit<Me, 'id'>) => void; onHost: (name: string, sb: number, bb: number, bbs: number) => void; onJoin: () => void }) {
  const [hosting, setHosting] = useState(false)
  const [name, setName] = useState('')
  const [stake, setStake] = useState(2)
  const [bbs, setBbs] = useState(100)
  return (
    <div className="home">
      <div className="profile">
        <button className="avatar-btn" onClick={() => setMe({ ...me, avatar: (me.avatar + 1) % AVATARS })} title="Change avatar" aria-label="Change avatar">
          <Avatar seed={me.avatar} size={72} />
        </button>
        <div className="grow">
          <label className="caps muted" htmlFor="name">
            Your name
          </label>
          <input id="name" className="text" maxLength={16} value={me.name} onChange={e => setMe({ ...me, name: e.target.value })} />
        </div>
      </div>
      <h1 className="hero">No-limit hold'em with the people in the room. No internet needed.</h1>
      {!hosting ? (
        <div className="home-actions">
          <button className="btn btn-primary" onClick={() => setHosting(true)}>
            <b>Host a table</b>
            <small>Deal from this device</small>
          </button>
          <button className="btn" onClick={onJoin}>
            <b>Join a table</b>
            <small>Connect to a phone or a browser</small>
          </button>
        </div>
      ) : (
        <div className="host-form">
          <label className="caps muted" htmlFor="tname">
            Table name
          </label>
          <input id="tname" className="text" placeholder={`${me.name}'s table`} value={name} onChange={e => setName(e.target.value)} maxLength={24} />
          <div className="caps muted">Blinds</div>
          <div className="presets">
            {STAKES.map(([sb, bb], k) => (
              <button key={k} className={`preset ${stake === k ? 'on' : ''}`} onClick={() => setStake(k)}>
                {stakes({ sb, bb })}
              </button>
            ))}
          </div>
          <div className="caps muted">Buy-in</div>
          <div className="presets">
            {[50, 100, 200].map(n => (
              <button key={n} className={`preset ${bbs === n ? 'on' : ''}`} onClick={() => setBbs(n)}>
                {n} big blinds
              </button>
            ))}
          </div>
          <div className="home-actions">
            <button className="btn" onClick={() => setHosting(false)}>
              <b>Back</b>
            </button>
            <button className="btn btn-primary" onClick={() => onHost(name.trim() || `${me.name}'s table`, STAKES[stake][0], STAKES[stake][1], bbs)}>
              <b>Open the table</b>
              <small>Players can join once it's open</small>
            </button>
          </div>
          <p className="muted small">
            Hosting from a browser? Players join with a code over the same Wi-Fi. Phones can't find a browser, so if anyone is on the flush app, host from a phone instead.
          </p>
        </div>
      )}
    </div>
  )
}

function JoinScreen({ net, guest, onBack, onCode }: { net: Net; guest: Guest; onBack: () => void; onCode: () => void }) {
  const [linking, setLinking] = useState('')
  const linkPhone = async () => {
    setLinking('Pick the host phone in the list…')
    try {
      await net.linkPhone()
      setLinking('Connected. Waiting for the table…')
    } catch (e) {
      setLinking(String((e as Error)?.message ?? e))
    }
  }
  const tables = [...guest.tables]
  return (
    <div className="home">
      <div className="subhead">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <div className="caps muted">Join</div>
          <div className="stakes">Tables nearby</div>
        </div>
      </div>
      {guest.full && <p className="error">That table is full.</p>}
      {guest.closed && <p className="muted">The host closed the table.</p>}
      <div className="tables">
        {tables.length === 0 && <p className="muted">No tables yet. Connect to the host first.</p>}
        {tables.map(([id, t]) => (
          <div key={id} className="table-row">
            <div>
              <div>{t.name}</div>
              <div className="muted small">
                {stakes(t)} · {t.seated} of {t.max} seated
              </div>
            </div>
            <button className="btn btn-primary" disabled={t.seated >= t.max} onClick={() => guest.join(id)}>
              <b>Join</b>
            </button>
          </div>
        ))}
      </div>
      <div className="home-actions">
        {net.ble ? (
          <button className="btn" onClick={linkPhone}>
            <b>Connect to a phone</b>
            <small>Over Bluetooth, when the host is on the app</small>
          </button>
        ) : (
          <div className="btn disabled-note">
            <b>Bluetooth isn't available here</b>
            <small>Use Chrome on a computer or Android to join a phone's table</small>
          </div>
        )}
        <button className="btn" onClick={onCode}>
          <b>Join with a code</b>
          <small>When the host is a browser on this Wi-Fi</small>
        </button>
      </div>
      {linking && <p className="muted small">{linking}</p>}
    </div>
  )
}
