// The table protocol over direct, encrypted SDK messages. The host runs the Table and sends each
// player their own view (public state plus their hole cards); players send actions back.
import type { Card } from './cards.ts'
import { act, canStart, endHand, leave, legal, MAX_SEATS, newTable, sit, startHand, type Action, type Result, type Seat, type Street, type Table } from './game.ts'

export type SeatView = Omit<Seat, 'hole'> & { cards: Card[] | null; hasCards: boolean }

export type View = {
  epoch: string // one per Host instance; a restarted host starts a new one
  v: number
  name: string
  host: string
  sb: number
  bb: number
  buyIn: number
  hand: number
  street: Street
  board: Card[]
  button: number
  sbSeat: number
  bbSeat: number
  toAct: number | null
  currentBet: number
  minRaise: number
  seats: (SeatView | null)[]
  result: Result | null
  running: boolean
  you: number // -1 when not seated
  hole: Card[]
  turnLeft: number | null // ms, as sent
  deadline: number | null // local clock: Date.now() + turnLeft on arrival
}

export type TableInfo = { name: string; sb: number; bb: number; seated: number; max: number }

export type Msg =
  | ({ t: 'table' } & TableInfo) // host → nearby device
  | { t: 'hello' } // device → nearby device: "are you hosting?"
  | { t: 'join'; name: string; avatar: number }
  | { t: 'full' }
  | { t: 'state'; view: View }
  | { t: 'act'; hand: number; action: Action }
  | { t: 'rebuy' }
  | { t: 'sit'; out: boolean }
  | { t: 'leave' }
  | { t: 'closed' } // host → players: the table is gone

/** What a platform's network adapter gives a session. */
export interface Send {
  send(to: string, msg: Msg): void
}

export type Me = { id: string; name: string; avatar: number }
export type Config = { name: string; sb: number; bb: number; buyIn: number; turnMs: number; nextHandMs: number }

export const DEFAULTS = { turnMs: 30_000, nextHandMs: 6_000 }

const clear = (t: ReturnType<typeof setTimeout> | undefined) => t !== undefined && clearTimeout(t)

export function parse(content: string): Msg | null {
  try {
    const m = JSON.parse(content)
    return m && typeof m === 'object' && typeof m.t === 'string' ? m : null
  } catch {
    return null
  }
}

export const money = (cents: number) => {
  const d = cents / 100
  return '$' + (Number.isInteger(d) ? d.toLocaleString('en-US') : d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}
export const moneyExact = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const stakes = (v: { sb: number; bb: number }) => `${money(v.sb)} / ${money(v.bb)}`
export const pot = (v: { seats: ({ committed: number } | null)[] }) => v.seats.reduce((n, s) => n + (s?.committed ?? 0), 0)

const cleanName = (x: unknown, max = 16) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '') || 'Player'
const isAction = (a: any): a is Action =>
  a && (a.type === 'fold' || a.type === 'check' || a.type === 'call' || (a.type === 'raise' && Number.isFinite(a.to)))

export class Host {
  readonly t: Table
  private v = 0
  private readonly epoch = Math.random().toString(36).slice(2)
  private running = false
  private deadline: number | null = null
  private turnKey = ''
  private turnTimer: ReturnType<typeof setTimeout> | undefined
  private nextTimer: ReturnType<typeof setTimeout> | undefined
  private readonly peers = new Set<string>()
  view!: View
  private readonly net: Send
  readonly cfg: Config
  private readonly me: Me
  private readonly onChange: (v: View) => void

  constructor(net: Send, cfg: Config, me: Me, onChange: (v: View) => void, peers: Iterable<string> = []) {
    this.net = net
    this.cfg = cfg
    this.me = me
    this.onChange = onChange
    this.t = newTable(cfg.sb, cfg.bb, cfg.buyIn)
    sit(this.t, me.id, cleanName(me.name), me.avatar)
    this.push()
    for (const p of peers) this.peerUp(p)
  }

  private seatOf = (id: string) => this.t.seats.findIndex(s => s?.id === id)

  private info = (): Msg => ({ t: 'table', name: this.cfg.name, sb: this.cfg.sb, bb: this.cfg.bb, seated: this.t.seats.filter(Boolean).length, max: MAX_SEATS })

  peerUp(id: string) {
    this.peers.add(id)
    const i = this.seatOf(id)
    if (i < 0) return this.net.send(id, this.info())
    this.t.seats[i]!.connected = true
    this.push()
  }

  peerDown(id: string) {
    this.peers.delete(id)
    const i = this.seatOf(id)
    if (i < 0) return
    this.t.seats[i]!.connected = false
    this.push()
  }

  message(from: string, m: Msg) {
    const i = this.seatOf(from)
    switch (m.t) {
      case 'hello':
        if (i < 0) this.net.send(from, this.info())
        else this.push()
        return
      case 'join': {
        if (i >= 0) {
          this.t.seats[i]!.connected = true
          return this.update()
        }
        if (sit(this.t, from, cleanName(m.name), Number.isInteger(m.avatar) ? m.avatar : 0) < 0) return this.net.send(from, { t: 'full' })
        for (const p of this.peers) if (p !== from && this.seatOf(p) < 0) this.net.send(p, this.info())
        return this.update()
      }
      case 'act':
        if (i >= 0 && m.hand === this.t.hand && isAction(m.action)) this.apply(i, m.action)
        return
      case 'rebuy':
        if (i >= 0) this.rebuy(i)
        return
      case 'sit':
        if (i >= 0) this.sit(i, !!m.out)
        return
      case 'leave':
        if (i >= 0) {
          leave(this.t, i)
          this.update()
        }
        return
    }
  }

  // The host's own player.
  act = (a: Action) => this.apply(this.seatOf(this.me.id), a)
  rebuyMe = () => this.rebuy(this.seatOf(this.me.id))
  sitMe = (out: boolean) => this.sit(this.seatOf(this.me.id), out)

  start() {
    this.running = true
    this.update()
  }

  stop() {
    this.running = false
    clear(this.turnTimer)
    clear(this.nextTimer)
  }

  /** Ends the table for everyone. */
  close() {
    this.stop()
    for (const s of this.t.seats) if (s && s.id !== this.me.id) this.net.send(s.id, { t: 'closed' })
  }

  kick(i: number) {
    const s = this.t.seats[i]
    if (!s || s.id === this.me.id) return
    leave(this.t, i)
    this.update()
  }

  private apply(i: number, a: Action) {
    try {
      act(this.t, i, a)
    } catch {
      return // illegal or stale: the player's next view shows the truth
    }
    this.update()
  }

  private rebuy(i: number) {
    const s = this.t.seats[i]
    if (!s || s.stack > 0 || s.inHand) return
    s.stack = this.t.buyIn
    s.sittingOut = false
    this.update()
  }

  private sit(i: number, out: boolean) {
    const s = this.t.seats[i]
    if (!s || (!out && s.stack === 0)) return
    s.sittingOut = out
    this.update()
  }

  /** After any change: restart the turn clock if the turn moved, deal when due, send views. */
  private update() {
    const t = this.t
    if (this.running && t.street === 'idle' && canStart(t)) startHand(t)
    // Every action moves the turn, the board, or the pot, so this changes exactly when a new clock is due.
    const key = `${t.hand}/${t.toAct}/${t.board.length}/${pot(t)}`
    if (key !== this.turnKey) {
      this.turnKey = key
      clear(this.turnTimer)
      this.deadline = null
      if (t.toAct !== null) {
        const seat = t.seats[t.toAct]!
        const ms = seat.connected ? this.cfg.turnMs : Math.min(this.cfg.turnMs, 10_000)
        this.deadline = Date.now() + ms
        const [hand, who] = [t.hand, t.toAct]
        this.turnTimer = setTimeout(() => this.timeout(hand, who), ms)
      }
    }
    if (t.street === 'showdown' && this.running && this.nextTimer === undefined) {
      this.nextTimer = setTimeout(() => {
        this.nextTimer = undefined
        if (!this.running) return
        if (canStart(t)) startHand(t)
        else endHand(t)
        this.update()
      }, this.cfg.nextHandMs)
    }
    this.push()
  }

  private timeout(hand: number, i: number) {
    const t = this.t
    if (t.hand !== hand || t.toAct !== i) return
    act(t, i, { type: legal(t, i).canCheck ? 'check' : 'fold' })
    t.seats[i]!.sittingOut = true // back with "I'm back"
    this.update()
  }

  private viewFor(i: number): View {
    const t = this.t
    const reveal = t.street === 'showdown' && !!t.result?.showdown
    return {
      epoch: this.epoch,
      v: this.v,
      name: this.cfg.name,
      host: this.me.id,
      sb: t.sb, bb: t.bb, buyIn: t.buyIn, hand: t.hand, street: t.street, board: t.board,
      button: t.button, sbSeat: t.sbSeat, bbSeat: t.bbSeat, toAct: t.toAct, currentBet: t.currentBet, minRaise: t.minRaise,
      seats: t.seats.map(s => {
        if (!s) return null
        const { hole, ...rest } = s
        return { ...rest, hasCards: s.inHand && hole.length > 0, cards: reveal && s.inHand ? hole : null }
      }),
      result: t.result,
      running: this.running,
      you: i,
      hole: i >= 0 ? t.seats[i]!.hole : [],
      turnLeft: this.deadline === null ? null : Math.max(0, this.deadline - Date.now()),
      deadline: this.deadline,
    }
  }

  private push() {
    this.v++
    this.t.seats.forEach((s, i) => {
      if (s && s.id !== this.me.id && this.peers.has(s.id)) this.net.send(s.id, { t: 'state', view: this.viewFor(i) })
    })
    this.view = this.viewFor(this.seatOf(this.me.id))
    this.onChange(this.view)
  }
}

export class Guest {
  readonly tables = new Map<string, TableInfo>()
  host: string | null = null
  view: View | null = null
  hostLost = false
  full = false
  closed = false
  private readonly net: Send
  private readonly me: Me
  private readonly onChange: () => void

  constructor(net: Send, me: Me, onChange: () => void, peers: Iterable<string> = []) {
    this.net = net
    this.me = me
    this.onChange = onChange
    for (const p of peers) this.peerUp(p)
  }

  peerUp(id: string) {
    if (id === this.host) {
      this.hostLost = false
      this.net.send(id, { t: 'join', name: this.me.name, avatar: this.me.avatar })
      this.onChange()
    } else this.net.send(id, { t: 'hello' })
  }

  peerDown(id: string) {
    if (id === this.host) this.hostLost = true
    else this.tables.delete(id)
    this.onChange()
  }

  message(from: string, m: Msg) {
    if (m.t === 'table') {
      this.tables.set(from, { name: cleanName(m.name, 24), sb: m.sb, bb: m.bb, seated: m.seated, max: m.max })
    } else if ((m.t === 'full' || m.t === 'closed') && from === this.host) {
      this.full = m.t === 'full'
      this.closed = m.t === 'closed'
      this.tables.delete(from)
      this.host = null
      this.view = null
    } else if (m.t === 'state' && from === this.host) {
      const cur = this.view
      if (cur && cur.epoch === m.view.epoch && cur.v >= m.view.v) return
      this.view = { ...m.view, deadline: m.view.turnLeft === null ? null : Date.now() + m.view.turnLeft }
      this.hostLost = false
    } else return
    this.onChange()
  }

  join(host: string) {
    this.host = host
    this.full = this.closed = false
    this.view = null
    this.net.send(host, { t: 'join', name: this.me.name, avatar: this.me.avatar })
    this.onChange()
  }

  private toHost(m: Msg) {
    if (this.host) this.net.send(this.host, m)
  }

  act = (action: Action) => this.view && this.toHost({ t: 'act', hand: this.view.hand, action })
  rebuyMe = () => this.toHost({ t: 'rebuy' })
  sitMe = (out: boolean) => this.toHost({ t: 'sit', out })
  leaveTable() {
    this.toHost({ t: 'leave' })
    this.host = null
    this.view = null
    this.onChange()
  }
}
