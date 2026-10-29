import { useEffect, useRef, useState } from 'react'
import { evaluate } from '../../engine/cards.ts'
import { MAX_SEATS, type Action } from '../../engine/game.ts'
import { badgeOf, liveCount, othersOf, outcome, readyCount, seatStatus, sizing, STREET } from '../../engine/display.ts'
import { DEFAULTS, moneyExact, pot, stakes, type SeatView, type View } from '../../engine/session.ts'
import { Avatar, Badge, CardBack, PlayingCard, Ring, useSecondsLeft } from './ui'

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

function Opponent({ v, i, s }: { v: View; i: number; s: SeatView }) {
  const secs = useSecondsLeft(v.toAct === i ? v.deadline : null)
  const out = !s.inHand && v.street !== 'idle'
  const won = v.street === 'showdown' && v.result?.pots.some(p => p.winners.includes(i))
  return (
    <div className={`opp ${out ? 'opp-out' : ''} ${v.toAct === i ? 'opp-turn' : ''}`}>
      <Avatar seed={s.avatar} size={44} dim={out || !s.connected} />
      <div className="opp-name">
        {s.name} {badge(v, i)}
      </div>
      <div className={`opp-stack ${won ? 'win' : ''}`}>{moneyExact(s.stack)}</div>
      {s.cards ? (
        <div className="opp-cards">
          {s.cards.map(c => (
            <PlayingCard key={c} card={c} size="xs" />
          ))}
        </div>
      ) : s.hasCards && v.street !== 'showdown' ? (
        <div className="opp-cards">
          <CardBack />
          <CardBack />
        </div>
      ) : null}
      <div className="opp-status">{seatStatus(v, i, s, secs)}</div>
    </div>
  )
}

function ActionPanel({ v, c }: { v: View; c: Controls }) {
  const l = sizing(v)
  const { clamp, opening, presets } = l
  const [to, setTo] = useState(l.initial)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false) // phones: slider, presets and fold sit behind ↑
  const secs = useSecondsLeft(v.deadline)
  useEffect(() => setText((to / 100).toFixed(2)), [to])
  const raiseLabel = to === l.maxTo ? `All in ${moneyExact(to)}` : `${opening ? 'Bet' : 'Raise to'} ${moneyExact(to)}`
  return (
    <div className={`actions ${open ? 'open' : ''}`}>
      <div className="your-move">
        {secs !== null && <Ring seconds={secs} total={DEFAULTS.turnMs / 1000} />}
        <span>Your move</span>
      </div>
      {l.canRaise && (
        <>
          <div className="bet-row">
            <label htmlFor="bet">{opening ? 'Bet' : 'Raise to'}</label>
            <div className="bet-input">
              <span>$</span>
              <input
                id="bet"
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
            <input className="slider" type="range" min={l.minTo} max={l.maxTo} step={v.sb} value={to} onChange={e => setTo(clamp(+e.target.value))} aria-label="Bet amount" />
          </div>
          <div className="presets">
            {presets.map(([label, amount]) => (
              <button key={label} className={`preset ${to === amount ? 'on' : ''}`} onClick={() => setTo(amount)}>
                <span>{label}</span>
                <span>{moneyExact(amount)}</span>
              </button>
            ))}
          </div>
          <div className="muted small minmax">
            Min {moneyExact(l.minTo)} · Max {moneyExact(l.maxTo)}
          </div>
        </>
      )}
      <div className="buttons">
        <button className="btn fold-btn" onClick={() => c.act({ type: 'fold' })}>
          <b>Fold</b>
          <small>Give up this hand</small>
        </button>
        {l.canCheck ? (
          <button className="btn" onClick={() => c.act({ type: 'check' })}>
            <b>Check</b>
            <small>No bet to match</small>
          </button>
        ) : (
          <button className="btn" onClick={() => c.act({ type: 'call' })}>
            <b>{l.toCall === v.seats[v.you]!.stack ? 'Call all in' : 'Call'} {moneyExact(l.toCall)}</b>
            <small>Match the bet</small>
          </button>
        )}
        {l.canRaise && (
          <button className="btn btn-primary" onClick={() => c.act({ type: 'raise', to })}>
            <b>{raiseLabel}</b>
            <small>Confirm amount</small>
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
    <div className="result">
      <div className="result-title win">
        {o.who}
        {o.hand ? ` · ${o.hand}` : ''}
      </div>
      <div className="result-box">
        {o.showdown ? (
          <>
            <div className="caps muted">Winning hand</div>
            <div className="result-hand">{o.hand}</div>
            {o.beats && <div className="muted">Beats {o.beats}</div>}
          </>
        ) : (
          <div className="result-hand small-hand">Everyone else folded</div>
        )}
        <div className="win result-amount">{moneyExact(o.total)} pot awarded</div>
        {o.sidePots.map((p, k) => (
          <div key={k} className="muted small">
            Side pot {moneyExact(p.amount)} → {p.to}
          </div>
        ))}
        <div className="muted small next">Next hand starting…</div>
      </div>
    </div>
  )
}

function Waiting({ v, c }: { v: View; c: Controls }) {
  const me = v.seats[v.you]!
  const turn = v.toAct !== null ? v.seats[v.toAct] : null
  const secs = useSecondsLeft(v.deadline)
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
        <p className="muted">Phones nearby running flush can join from their Join screen. Browsers connect to a phone over Bluetooth, or to you with a code.</p>
        {!v.running && (
          <button className="btn btn-primary wide" disabled={ready < 2} onClick={c.start}>
            <b>Start the game</b>
            <small>{ready < 2 ? 'Needs two players' : `Deal the first hand`}</small>
          </button>
        )}
      </Panel>
    )
  }
  return (
    <Panel title={turn ? `Waiting for ${turn.name}` : 'Waiting'}>
      {secs !== null && <Ring seconds={secs} total={DEFAULTS.turnMs / 1000} />}
      {!me.inHand && <p className="muted">You folded. You're in again next hand.</p>}
    </Panel>
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
  const myHand = me && v.hole.length === 2 ? evaluate([...v.hole, ...v.board]).name : null
  const swipe = useRef<number | null>(null)
  const total = showdown ? v.result!.pots.reduce((n, p) => n + p.amount, 0) : pot(v)

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

      <div className="opps">
        {others.map(i => (
          <Opponent key={v.seats[i]!.id} v={v} i={i} s={v.seats[i]!} />
        ))}
        {others.length === 0 && <div className="muted empty-opps">Nobody else is here yet</div>}
      </div>

      <div className="center">
        <div className="pot-line">
          <span className="caps muted">{showdown ? 'Pot awarded' : 'Total pot'}</span>
          <span className={`pot ${showdown ? 'win' : ''}`}>{moneyExact(total)}</span>
          <span className="muted street">{showdown ? (v.result!.showdown ? 'Showdown' : 'Hand complete') : STREET[v.street]}</span>
        </div>
        <div className="board">
          {[0, 1, 2, 3, 4].map(k => (
            <PlayingCard key={k} card={v.board[k] ?? null} size="lg" />
          ))}
        </div>
        <div className="board-foot muted">
          <span>{showdown ? 'Hand complete' : v.street === 'idle' ? '' : live === 2 ? 'Heads up' : `${live} players`}</span>
          <span>{v.hand > 0 ? `Hand ${v.hand}` : ''}</span>
        </div>
      </div>

      <div className="bottom">
        {me && (
          <div className={`me ${won ? 'me-won' : ''}`}>
            <div className="me-head">
              <Avatar seed={me.avatar} size={44} />
              <div>
                <div className="me-name">You {badge(v, v.you)}</div>
                <div>
                  <span className="caps muted">Stack</span> <span className="me-stack">{moneyExact(me.stack)}</span>
                </div>
              </div>
            </div>
            <div
              className="hole"
              onPointerDown={e => (swipe.current = e.clientY)}
              onPointerUp={e => {
                if (myTurn && swipe.current !== null && swipe.current - e.clientY > 60) c.act({ type: 'fold' })
                swipe.current = null
              }}
            >
              {v.hole.length ? v.hole.map(card => <PlayingCard key={card} card={card} size="lg" />) : <div className="muted small">No cards this hand</div>}
            </div>
            {myTurn && <div className="swipe-hint muted small">↑ Swipe up to fold</div>}
            {myHand && (
              <div className="me-hand">
                <div className="muted small">{won ? 'Winning hand' : 'Your hand'}</div>
                <div className={won ? 'win' : ''}>{myHand}</div>
              </div>
            )}
          </div>
        )}
        <div className="side">{showdown ? <Result v={v} /> : myTurn ? <ActionPanel key={`${v.hand}/${v.board.length}/${v.currentBet}`} v={v} c={c} /> : me ? <Waiting v={v} c={c} /> : null}</div>
      </div>
    </div>
  )
}
