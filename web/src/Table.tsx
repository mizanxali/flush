import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { evaluate } from '../../engine/cards.ts'
import { MAX_SEATS, type Action } from '../../engine/game.ts'
import { badgeOf, liveCount, othersOf, outcome, readyCount, seatSpot, seatStatus, sizing, STREET } from '../../engine/display.ts'
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

/** Both layouts' positions as CSS variables; the stylesheet picks one per screen shape. */
function spotStyle(v: View, i: number): CSSProperties {
  const wide = seatSpot(v, i, false)
  const tall = seatSpot(v, i, true)
  return { '--x': `${wide.x}%`, '--y': `${wide.y}%`, '--tx': `${tall.x}%`, '--ty': `${tall.y}%` } as CSSProperties
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

function Seat({ v, i, s }: { v: View; i: number; s: SeatView }) {
  const secs = useSecondsLeft(v.toAct === i ? v.deadline : null)
  const out = !s.inHand && v.street !== 'idle'
  const won = v.street === 'showdown' && v.result?.pots.some(p => p.winners.includes(i))
  return (
    <div className={`seat ${out ? 'seat-out' : ''} ${v.toAct === i ? 'seat-turn' : ''}`} style={spotStyle(v, i)}>
      <Avatar seed={s.avatar} size={40} dim={out || !s.connected} />
      <div className="seat-name">
        {s.name} {badge(v, i)}
      </div>
      <div className={`seat-stack ${won ? 'win' : ''}`}>{moneyExact(s.stack)}</div>
      {s.cards ? (
        <div className="seat-cards">
          {s.cards.map(c => (
            <PlayingCard key={c} card={c} size="xs" />
          ))}
        </div>
      ) : s.hasCards && v.street !== 'showdown' ? (
        <div className="seat-cards">
          <CardBack />
          <CardBack />
        </div>
      ) : null}
      <div className="seat-status">{seatStatus(v, i, s, secs)}</div>
    </div>
  )
}

function ActionPanel({ v, c }: { v: View; c: Controls }) {
  const l = sizing(v)
  const { clamp, opening, presets } = l
  const [to, setTo] = useState(l.initial)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false) // phones: slider, presets and fold sit behind ↑
  useEffect(() => setText((to / 100).toFixed(2)), [to])
  const raiseLabel = to === l.maxTo ? `All in ${moneyExact(to)}` : `${opening ? 'Bet' : 'Raise to'} ${moneyExact(to)}`
  return (
    <div className={`actions ${open ? 'open' : ''}`}>
      <TurnBar label="Your move" deadline={v.deadline} />
      {l.canRaise && (
        <>
          <div className="presets">
            {presets.map(([label, amount]) => (
              <button key={label} className={`preset ${to === amount ? 'on' : ''}`} onClick={() => setTo(amount)} title={moneyExact(amount)}>
                {label}
              </button>
            ))}
          </div>
          <div className="bet-row">
            <input className="slider" type="range" min={l.minTo} max={l.maxTo} step={v.sb} value={to} onChange={e => setTo(clamp(+e.target.value))} aria-label="Bet amount" />
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
        </>
      )}
      <div className="buttons">
        <button className="btn fold-btn" onClick={() => c.act({ type: 'fold' })}>
          <b>Fold</b>
        </button>
        {l.canCheck ? (
          <button className="btn" onClick={() => c.act({ type: 'check' })}>
            <b>Check</b>
          </button>
        ) : (
          <button className="btn" onClick={() => c.act({ type: 'call' })}>
            <b>
              {l.toCall === v.seats[v.you]!.stack ? 'Call all in' : 'Call'} {moneyExact(l.toCall)}
            </b>
          </button>
        )}
        {l.canRaise && (
          <button className="btn btn-primary" onClick={() => c.act({ type: 'raise', to })}>
            <b>{raiseLabel}</b>
          </button>
        )}
        <button className="btn more-btn" onClick={() => setOpen(!open)} aria-label={open ? 'Fewer options' : 'Bet sizes and fold'} aria-expanded={open}>
          <b>{open ? '↓' : '↑'}</b>
        </button>
      </div>
    </div>
  )
}

function Result({ v }: { v: View }) {
  if (!v.result?.pots.length) return null
  const o = outcome(v)
  return (
    <div className="info">
      <div className="caps win">{o.who}</div>
      <div className="info-title">{o.showdown ? o.hand : 'Everyone else folded'}</div>
      {o.beats && <div className="muted">Beats {o.beats}</div>}
      <div className="win info-amount">{moneyExact(o.total)} pot awarded</div>
      {o.sidePots.map((p, k) => (
        <div key={k} className="muted small">
          Side pot {moneyExact(p.amount)} → {p.to}
        </div>
      ))}
    </div>
  )
}

/** The left column: your hand, or how the last one ended. */
function Info({ v }: { v: View }) {
  if (v.street === 'showdown' && v.result) return <Result v={v} />
  const me = v.seats[v.you]
  const hand = v.hole.length === 2 ? evaluate([...v.hole, ...v.board]).name : null
  return (
    <div className="info">
      <div className="caps muted">Your hand</div>
      <div className="info-title">{hand ?? (me?.inHand === false && v.street !== 'idle' ? 'Out of this hand' : 'No cards yet')}</div>
    </div>
  )
}

/** The right column when it isn't your move. */
function Waiting({ v, c }: { v: View; c: Controls }) {
  const me = v.seats[v.you]!
  const turn = v.toAct !== null ? v.seats[v.toAct] : null
  if (v.street === 'showdown') return <TurnBar label="Next hand starting…" deadline={null} />
  if (me.stack === 0 && !me.inHand)
    return (
      <Panel title="You're out of chips">
        <button className="btn btn-primary wide" onClick={c.rebuy}>
          <b>Rebuy {moneyExact(v.buyIn)}</b>
          <small>Back in from the next hand</small>
        </button>
      </Panel>
    )
  if (me.sittingOut)
    return (
      <Panel title="You're sitting out">
        <button className="btn btn-primary wide" onClick={() => c.sit(false)}>
          <b>I'm back</b>
          <small>Deal me in next hand</small>
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
            <b>Start the game</b>
            <small>{ready < 2 ? 'Needs two players' : 'Deal the first hand'}</small>
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

  return (
    <div className="table">
      {c.banner && <div className="banner">{c.banner}</div>}
      <div className="subhead">
        <button className="icon-btn" onClick={c.leave} aria-label="Leave table">
          ←
        </button>
        <div>
          <div className="caps muted">
            {v.name} · {seated} of {MAX_SEATS} seated{live === 2 && v.street !== 'idle' ? ' · heads up' : ''}
          </div>
          <div className="stakes">{stakes(v)}</div>
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
          <div className={`caps ${showdown ? 'win' : 'muted'}`}>{showdown ? 'Pot awarded' : 'Total pot'}</div>
          <div className={`pot ${showdown ? 'win' : ''}`}>{moneyExact(total)}</div>
          <div className="board">
            {[0, 1, 2, 3, 4].map(k => (
              <PlayingCard key={k} card={v.board[k] ?? null} size="lg" />
            ))}
          </div>
        </div>
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
            <div className="you-line">
              <span className="muted">You</span> {badge(v, v.you)} <span className={`you-stack ${won ? 'win' : ''}`}>{moneyExact(me.stack)}</span>
            </div>
            {myTurn && <div className="swipe-hint muted small">↑ Swipe up to fold</div>}
          </div>
        )}
      </div>

      <div className="bottom">
        <Info v={v} />
        <div className="side">{myTurn ? <ActionPanel key={`${v.hand}/${v.board.length}/${v.currentBet}`} v={v} c={c} /> : me ? <Waiting v={v} c={c} /> : null}</div>
      </div>
    </div>
  )
}
