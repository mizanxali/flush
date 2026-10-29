import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { evaluate, rankLabel, suitSymbol } from '../../engine/cards.ts'
import { MAX_SEATS, type Action } from '../../engine/game.ts'
import { badgeOf, liveCount, logLine, othersOf, outcome, readyCount, seatSpot, seatStatus, sizing, STREET } from '../../engine/display.ts'
import { DEFAULTS, moneyExact, pot, stakes, type SeatView, type View } from '../../engine/session.ts'
import { Avatar, Badge, CardBack, PlayingCard, useSecondsLeft } from './ui'

export type Controls = {
  act(a: Action): void
  rebuy(): void
  sit(out: boolean): void
  leave(): void
  start?: () => void // host only
  addBrowser?: () => void // host only
  banner?: string | null
}

const badge = (v: View, i: number) => {
  const b = badgeOf(v, i)
  return b && <Badge kind={b} />
}

const cardText = (cards: string[]) => cards.map(c => rankLabel(c) + suitSymbol(c)).join(' ')

/** Both layouts' positions as CSS variables; the stylesheet picks one per screen shape. */
function spotStyle(v: View, i: number): CSSProperties {
  const wide = seatSpot(v, i, false)
  const tall = seatSpot(v, i, true)
  // Seats above the middle hang upward from their spot, so their cards never reach the pot.
  return { '--x': `${wide.x}%`, '--y': `${wide.y}%`, '--ay': wide.y < 40 ? '-78%' : '-45%', '--tx': `${tall.x}%`, '--ty': `${tall.y}%` } as CSSProperties
}

/** "Your move ……… 14s" over a bar that drains with the clock. */
function TurnBar({ label, deadline }: { label: string; deadline: number | null }) {
  const secs = useSecondsLeft(deadline)
  const total = DEFAULTS.turnMs / 1000
  return (
    <div className="turn">
      <div className="turn-line">
        <span>{label}</span>
        {secs !== null && <span className={`turn-secs ${secs <= 5 ? 'low' : ''}`}>{secs}s</span>}
      </div>
      <div className="turn-track">{secs !== null && <div className={`turn-bar ${secs <= 5 ? 'low' : ''}`} style={{ width: `${(100 * secs) / total}%` }} />}</div>
    </div>
  )
}

/** A seat: its cards peek over a small plate with the avatar, name and stack. */
function Seat({ v, i, s }: { v: View; i: number; s: SeatView }) {
  const secs = useSecondsLeft(v.toAct === i ? v.deadline : null)
  const out = !s.inHand && v.street !== 'idle'
  const won = v.street === 'showdown' && v.result?.pots.some(p => p.winners.includes(i))
  return (
    <div className={`seat ${out ? 'seat-out' : ''} ${v.toAct === i ? 'seat-turn' : ''} ${won ? 'seat-won' : ''}`} style={spotStyle(v, i)}>
      <div className="seat-cards">
        {s.cards ? s.cards.map(c => <PlayingCard key={c} card={c} size="xs" />) : s.hasCards && v.street !== 'showdown' ? [<CardBack key="a" />, <CardBack key="b" />] : null}
      </div>
      <div className="plate">
        <Avatar seed={s.avatar} size={34} dim={!s.connected} />
        <div className="plate-text">
          <div className="seat-name">
            <span>{s.name}</span> {badge(v, i)}
          </div>
          <div className={`seat-stack ${won ? 'win' : ''}`}>{moneyExact(s.stack)}</div>
        </div>
      </div>
      <div className="seat-status">{seatStatus(v, i, s, secs)}</div>
    </div>
  )
}

function ActionPanel({ v, c }: { v: View; c: Controls }) {
  const l = sizing(v)
  const { clamp, opening } = l
  const [to, setTo] = useState(l.initial)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false) // phones: sizing and fold sit behind ↑
  useEffect(() => setText((to / 100).toFixed(2)), [to])
  const raiseLabel = to === l.maxTo ? `All in ${moneyExact(to)}` : `${opening ? 'Bet' : 'Raise to'} ${moneyExact(to)}`
  const callOrCheck = () => c.act(l.canCheck ? { type: 'check' } : { type: 'call' })
  const raise = () => l.canRaise && c.act({ type: 'raise', to })

  // Keyboard: F fold, C check or call, R raise, ↑↓ size by a big blind (shift: by ten).
  const keys = useRef({ callOrCheck, raise, to })
  keys.current = { callOrCheck, raise, to }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'f') c.act({ type: 'fold' })
      else if (k === 'c') keys.current.callOrCheck()
      else if (k === 'r') keys.current.raise()
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        setTo(clamp(keys.current.to + (e.key === 'ArrowUp' ? 1 : -1) * v.bb * (e.shiftKey ? 10 : 1)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [c, clamp, v.bb])

  // Presets become labelled ticks on the slider; equal amounts share one tick.
  const ticks = new Map<number, string[]>()
  for (const [label, amount] of l.presets) ticks.set(amount, [...(ticks.get(amount) ?? []), label])
  const at = (amount: number) => (l.maxTo === l.minTo ? 0 : ((amount - l.minTo) / (l.maxTo - l.minTo)) * 100)

  return (
    <div className={`actions ${open ? 'open' : ''}`}>
      <TurnBar label="Your move" deadline={v.deadline} />
      {l.canRaise && (
        <div className="bet-row">
          <div className="sizer">
            <input className="slider" type="range" min={l.minTo} max={l.maxTo} step={v.sb} value={to} onChange={e => setTo(clamp(+e.target.value))} aria-label="Bet amount" />
            <div className="ticks">
              {[...ticks].map(([amount, labels], k, all) => (
                <button
                  key={amount}
                  className={`tick ${to === amount ? 'on' : ''}`}
                  style={{ '--at': `${at(amount)}%` } as CSSProperties}
                  onClick={() => setTo(amount)}
                  title={`${labels.join(' · ')} ${moneyExact(amount)}`}
                >
                  {/* Too close to a labelled neighbour: keep the mark, drop the words. */}
                  {k > 0 && at(amount) - at(all[k - 1][0]) < 16 && k < all.length - 1 ? '' : labels.join(' · ')}
                </button>
              ))}
            </div>
          </div>
          <div className="bet-input">
            <span>$</span>
            <input
              aria-label={opening ? 'Bet amount' : 'Raise to'}
              inputMode="decimal"
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={() => {
                const x = Math.round(parseFloat(text) * 100)
                setTo(Number.isFinite(x) ? clamp(x) : to)
                setText((to / 100).toFixed(2))
              }}
            />
          </div>
        </div>
      )}
      <div className="buttons">
        <button className="btn fold-btn" onClick={() => c.act({ type: 'fold' })}>
          <b>Fold</b> <kbd>F</kbd>
        </button>
        <button className="btn" onClick={callOrCheck}>
          <b>{l.canCheck ? 'Check' : `${l.toCall === v.seats[v.you]!.stack ? 'Call all in' : 'Call'} ${moneyExact(l.toCall)}`}</b> <kbd>C</kbd>
        </button>
        {l.canRaise && (
          <button className="btn btn-primary" onClick={raise}>
            <b>{raiseLabel}</b> <kbd>R</kbd>
          </button>
        )}
        <button className="btn more-btn" onClick={() => setOpen(!open)} aria-label={open ? 'Fewer options' : 'Bet sizes and fold'} aria-expanded={open}>
          <b>{open ? '↓' : '↑'}</b>
        </button>
      </div>
    </div>
  )
}

/** The left column: what has happened this hand, newest last. Wins stand out. */
function HandLog({ v }: { v: View }) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [v.log.length])
  return (
    <div className="log">
      <div className="caps muted">{v.hand > 0 ? `Hand ${v.hand}` : 'No hands yet'}</div>
      <ol ref={list}>
        {v.log.map((e, k) => (
          <li key={k} className={e.kind === 'win' ? 'win' : e.kind === 'board' ? 'log-board' : ''}>
            {logLine(v, e, cardText)}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The right column when it isn't your move. */
function Waiting({ v, c }: { v: View; c: Controls }) {
  const me = v.seats[v.you]!
  const turn = v.toAct !== null ? v.seats[v.toAct] : null
  if (v.street === 'showdown' && v.result?.pots.length) {
    const o = outcome(v)
    return (
      <Panel title={`${o.who} ${moneyExact(o.total)}${o.hand ? ` with ${o.hand.toLowerCase()}` : ''}`}>
        <p className="muted small">{o.beats ? `Beats ${o.beats}. ` : ''}Next hand starting…</p>
      </Panel>
    )
  }
  if (me.stack === 0 && !me.inHand)
    return (
      <Panel title="You're out of chips">
        <button className="btn btn-primary wide" onClick={c.rebuy}>
          <b>Rebuy {moneyExact(v.buyIn)}</b>
        </button>
      </Panel>
    )
  if (me.sittingOut)
    return (
      <Panel title="You're sitting out">
        <button className="btn btn-primary wide" onClick={() => c.sit(false)}>
          <b>Deal me in</b>
        </button>
      </Panel>
    )
  if (v.street === 'idle') {
    const ready = readyCount(v)
    if (!c.start) return <Panel title={v.running ? 'Waiting for players' : 'Waiting for the host to start'} />
    return (
      <Panel title={ready < 2 ? 'Waiting for players to join' : `${ready} players ready`}>
        <p className="muted small">Phones nearby running flush can join from their Join screen. Browsers connect to a phone over Bluetooth, or to you with a code.</p>
        {!v.running && (
          <button className="btn btn-primary wide" disabled={ready < 2} onClick={c.start}>
            <b>{ready < 2 ? 'Start once two are seated' : 'Start the game'}</b>
          </button>
        )}
      </Panel>
    )
  }
  return (
    <>
      <TurnBar label={turn ? `Waiting for ${turn.name}` : 'Waiting'} deadline={v.deadline} />
      {!me.inHand && <p className="muted small">You folded. You're in again next hand.</p>}
    </>
  )
}

const Panel = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div className="panel-msg">
    <div className="panel-title">{title}</div>
    {children}
  </div>
)

/** At showdown the pot flies to the first winner's seat (wide screens only). */
function PotFlight({ v, total }: { v: View; total: number }) {
  const w = v.result?.pots[0]?.winners[0]
  if (w === undefined) return null
  const spot = w === v.you ? { x: 50, y: 89 } : seatSpot(v, w, false)
  return (
    <div key={v.hand} className="flight" style={{ '--x': `${spot.x}%`, '--y': `${spot.y}%` } as CSSProperties}>
      +{moneyExact(total)}
    </div>
  )
}

export function Table({ v, c }: { v: View; c: Controls }) {
  const me = v.seats[v.you]
  const others = othersOf(v)
  const seated = v.seats.filter(Boolean).length
  const live = liveCount(v)
  const myTurn = v.toAct === v.you && v.street !== 'showdown'
  const showdown = v.street === 'showdown' && !!v.result
  const won = showdown && v.result!.pots.some(p => p.winners.includes(v.you))
  const swipe = useRef<number | null>(null)
  const total = showdown ? v.result!.pots.reduce((n, p) => n + p.amount, 0) : pot(v)
  const street = showdown ? (v.result!.showdown ? 'Showdown' : 'Hand complete') : STREET[v.street]
  const myHand = v.hole.length === 2 ? evaluate([...v.hole, ...v.board]).name : null

  return (
    <div className="table">
      {c.banner && <div className="banner">{c.banner}</div>}
      <div className="subhead">
        <button className="icon-btn" onClick={c.leave} aria-label="Leave table">
          ←
        </button>
        <div>
          <div className="caps muted">
            Blinds {stakes(v)} · {seated} of {MAX_SEATS} seated{live === 2 && v.street !== 'idle' ? ' · heads up' : ''}
          </div>
          <div className="stakes">{v.name}</div>
        </div>
        <div className="subhead-right">
          <span className="muted small hand-no">{v.hand > 0 ? `Hand ${v.hand}${street ? ` · ${street}` : ''}` : ''}</span>
          {c.addBrowser && (
            <button className="chip-btn" onClick={c.addBrowser}>
              + Browser
            </button>
          )}
          {me && !me.sittingOut && me.stack > 0 && (
            <button className="chip-btn" onClick={() => c.sit(true)} title="Sit out from the next hand">
              Sit out
            </button>
          )}
        </div>
      </div>

      <div className="felt">
        <div className="rim" />
        {others.map(i => (
          <Seat key={v.seats[i]!.id} v={v} i={i} s={v.seats[i]!} />
        ))}
        <div className="felt-center">
          {others.length === 0 && <div className="muted small">Nobody else is here yet</div>}
          <div className={`caps ${showdown ? 'win' : 'muted'}`}>{showdown ? 'Pot awarded' : 'Pot'}</div>
          <div className={`pot ${showdown ? 'win' : ''}`}>{moneyExact(total)}</div>
          <div className="board">
            {[0, 1, 2, 3, 4].map(k => (
              <PlayingCard key={k} card={v.board[k] ?? null} size="lg" />
            ))}
          </div>
        </div>
        {showdown && <PotFlight v={v} total={total} />}
        {me && (
          <div className={`you ${won ? 'you-won' : ''} ${myTurn ? 'seat-turn' : ''}`}>
            <div
              className="hole"
              onPointerDown={e => (swipe.current = e.clientY)}
              onPointerUp={e => {
                if (myTurn && swipe.current !== null && swipe.current - e.clientY > 60) c.act({ type: 'fold' })
                swipe.current = null
              }}
            >
              {v.hole.length ? v.hole.map(card => <PlayingCard key={card} card={card} size="lg" />) : [0, 1].map(k => <PlayingCard key={k} card={null} size="lg" />)}
            </div>
            <div className="you-meta">
              <div className="plate">
                <Avatar seed={me.avatar} size={30} />
                <div className="plate-text">
                  <div className="seat-name">
                    <span>You</span> {badge(v, v.you)}
                  </div>
                  <div className={`seat-stack ${won ? 'win' : ''}`}>{moneyExact(me.stack)}</div>
                </div>
              </div>
              <div className={`you-hand ${won ? 'win' : 'muted'}`}>{myHand ?? 'No cards yet'}</div>
            </div>
            {myTurn && <div className="swipe-hint muted small">↑ Swipe up to fold</div>}
          </div>
        )}
      </div>

      <div className="bottom">
        <HandLog v={v} />
        <div className="side">{myTurn ? <ActionPanel key={`${v.hand}/${v.board.length}/${v.currentBet}`} v={v} c={c} /> : me ? <Waiting v={v} c={c} /> : null}</div>
      </div>
    </div>
  )
}
