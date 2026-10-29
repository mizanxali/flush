// No-limit hold'em table. The host owns one Table and mutates it; everyone else sees views of it.
// Amounts are integer cents.
import { evaluate, shuffledDeck, type Card } from './cards.ts'

export const MAX_SEATS = 6

export type Action = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number }

export type Seat = {
  id: string // device address
  name: string
  avatar: number
  stack: number // behind, not yet bet
  bet: number // put in on this street
  committed: number // put in this hand, including `bet`
  hole: Card[]
  inHand: boolean // dealt in and not folded
  allIn: boolean
  acted: boolean // acted since the last full raise
  capped: boolean // facing an incomplete all-in raise after acting: may call or fold only
  sittingOut: boolean
  connected: boolean
  left: boolean // left mid-hand: chips stay in the pot, seat frees at the next hand
  last: string | null // last action, for display
}

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type PotResult = { amount: number; winners: number[]; hand: string | null; beats: string | null }
export type Result = { pots: PotResult[]; showdown: boolean; hands: Record<number, string> }

export type Table = {
  sb: number
  bb: number
  buyIn: number
  seats: (Seat | null)[]
  button: number
  sbSeat: number
  bbSeat: number
  hand: number
  street: Street
  board: Card[]
  deck: Card[]
  toAct: number | null
  currentBet: number
  minRaise: number
  result: Result | null
}

export function newTable(sb: number, bb: number, buyIn: number): Table {
  return {
    sb, bb, buyIn,
    seats: Array(MAX_SEATS).fill(null),
    button: -1, sbSeat: -1, bbSeat: -1,
    hand: 0, street: 'idle', board: [], deck: [],
    toAct: null, currentBet: 0, minRaise: bb, result: null,
  }
}

/** Seats a player in the first empty seat; returns the seat index, or -1 when full. */
export function sit(t: Table, id: string, name: string, avatar: number): number {
  const i = t.seats.findIndex(s => s === null)
  if (i < 0) return -1
  t.seats[i] = {
    id, name, avatar, stack: t.buyIn, bet: 0, committed: 0, hole: [],
    inHand: false, allIn: false, acted: false, capped: false, sittingOut: false, connected: true, left: false, last: null,
  }
  return i
}

const inPlay = (t: Table) => t.street !== 'idle' && t.street !== 'showdown'
const ready = (s: Seat | null): s is Seat => !!s && s.stack > 0 && !s.sittingOut
const canAct = (s: Seat | null): s is Seat => !!s && s.inHand && !s.allIn

/** Next seat index after `from` (wrapping) that passes `ok`, or -1. */
function next(t: Table, from: number, ok: (s: Seat | null) => boolean): number {
  for (let k = 1; k <= MAX_SEATS; k++) {
    const i = (from + k + MAX_SEATS) % MAX_SEATS
    if (ok(t.seats[i])) return i
  }
  return -1
}

export const canStart = (t: Table) => !inPlay(t) && t.seats.filter(ready).length >= 2

/** Frees a seat. Mid-hand the player folds and the seat (with its chips in the pot) frees at the next hand. */
export function leave(t: Table, i: number) {
  const s = t.seats[i]
  if (!s) return
  if (!inPlay(t) || (!s.inHand && s.committed === 0)) {
    t.seats[i] = null
    return
  }
  Object.assign(s, { left: true, sittingOut: true })
  if (!s.inHand) return
  if (t.toAct === i) act(t, i, { type: 'fold' })
  else fold(t, i)
}

/** Clears a finished hand when no new one can start, so the table reads as empty. */
export function endHand(t: Table) {
  Object.assign(t, { street: 'idle', board: [], toAct: null, result: null, currentBet: 0 })
  t.seats = t.seats.map(s => (s?.left ? null : s))
  for (const s of t.seats) if (s) Object.assign(s, { bet: 0, committed: 0, hole: [], inHand: false, allIn: false, last: null })
}

export function startHand(t: Table, deck = shuffledDeck()) {
  if (!canStart(t)) throw new Error('need two players with chips')
  const players = t.seats.filter(ready).length
  t.button = next(t, t.button, ready)
  // Heads-up the button posts the small blind and acts first before the flop.
  t.sbSeat = players === 2 ? t.button : next(t, t.button, ready)
  t.bbSeat = next(t, t.sbSeat, ready)
  t.hand++
  t.board = []
  t.deck = deck
  t.result = null
  t.seats = t.seats.map(s => (s?.left ? null : s))
  for (const s of t.seats) {
    if (!s) continue
    Object.assign(s, { bet: 0, committed: 0, hole: [], inHand: ready(s), allIn: false, acted: false, capped: false, last: null })
  }
  for (let k = 0; k < 2; k++)
    for (let i = t.sbSeat, n = 0; n < players; i = next(t, i, s => !!s?.inHand), n++) t.seats[i]!.hole.push(t.deck.pop()!)
  put(t, t.sbSeat, t.sb)
  put(t, t.bbSeat, t.bb)
  t.seats[t.sbSeat]!.last = 'SB'
  t.seats[t.bbSeat]!.last = 'BB'
  t.currentBet = t.bb
  t.minRaise = t.bb
  t.street = 'preflop'
  t.toAct = t.bbSeat
  advance(t)
}

function put(t: Table, i: number, amount: number) {
  const s = t.seats[i]!
  const x = Math.min(amount, s.stack)
  s.stack -= x
  s.bet += x
  s.committed += x
  if (s.stack === 0) s.allIn = true
}

export type Legal = { toCall: number; canCheck: boolean; canRaise: boolean; minTo: number; maxTo: number }

type LegalShape = {
  seats: ({ stack: number; bet: number; inHand: boolean; allIn: boolean; capped: boolean } | null)[]
  currentBet: number
  minRaise: number
}

/** What seat `i` may do now. Works on the host's Table and on a player's View. */
export function legal(t: LegalShape, i: number): Legal {
  const s = t.seats[i]!
  const toCall = Math.min(t.currentBet - s.bet, s.stack)
  const maxTo = s.bet + s.stack
  const othersCanAct = t.seats.some((o, j) => j !== i && o && o.inHand && !o.allIn)
  const canRaise = s.stack > toCall && !s.capped && othersCanAct
  return { toCall, canCheck: toCall === 0, canRaise, minTo: Math.min(t.currentBet + t.minRaise, maxTo), maxTo }
}

/** Applies seat `i`'s action. Throws on anything illegal, so callers can trust the table after. */
export function act(t: Table, i: number, a: Action) {
  if (!inPlay(t) || t.toAct !== i) throw new Error('not your turn')
  const s = t.seats[i]!
  const l = legal(t, i)
  if (a.type === 'fold') {
    fold(t, i)
  } else if (a.type === 'check') {
    if (!l.canCheck) throw new Error('cannot check')
    s.last = 'Check'
  } else if (a.type === 'call') {
    if (l.canCheck) throw new Error('nothing to call')
    put(t, i, l.toCall)
    s.last = s.allIn ? 'All in' : 'Call'
  } else if (a.type === 'raise') {
    const to = Math.floor(a.to)
    if (!l.canRaise || !(to >= l.minTo && to <= l.maxTo)) throw new Error('bad raise')
    const opening = t.currentBet === 0
    put(t, i, to - s.bet)
    const increment = to - t.currentBet
    if (increment >= t.minRaise) {
      // A full raise reopens the betting for everyone.
      t.minRaise = increment
      for (const o of t.seats) if (o && o !== s) Object.assign(o, { acted: false, capped: false })
    } else {
      // An all-in short of a full raise: those who already acted must answer, but may not re-raise.
      for (const o of t.seats) if (o && o !== s && o.acted) Object.assign(o, { acted: false, capped: true })
    }
    t.currentBet = to
    s.last = s.allIn ? 'All in' : opening ? 'Bet' : 'Raise'
  }
  s.acted = true
  advance(t)
}

function fold(t: Table, i: number) {
  const s = t.seats[i]!
  s.inHand = false
  s.last = 'Fold'
  // Out of turn (a player left): the action stays put unless the hand is now won.
  if (t.toAct !== i && t.seats.filter(x => x?.inHand).length === 1) finish(t)
}

/** Moves to the next player, street, or the end of the hand. */
function advance(t: Table) {
  const live = t.seats.filter(s => s?.inHand)
  if (live.length === 1) return finish(t)
  const pending = (s: Seat | null) => canAct(s) && (!s.acted || s.bet < t.currentBet)
  const n = next(t, t.toAct ?? t.button, pending)
  if (n >= 0) {
    t.toAct = n
    return
  }
  // Street over.
  for (const s of t.seats) if (s) Object.assign(s, { bet: 0, acted: false, capped: false })
  t.currentBet = 0
  t.minRaise = t.bb
  const actors = t.seats.filter(canAct).length
  if (t.street === 'river' || actors <= 1) {
    while (t.board.length < 5) t.board.push(t.deck.pop()!)
    return finish(t)
  }
  t.street = t.street === 'preflop' ? 'flop' : t.street === 'flop' ? 'turn' : 'river'
  t.board.push(...t.deck.splice(-(t.street === 'flop' ? 3 : 1)))
  for (const s of t.seats) if (s?.inHand && !s.allIn) s.last = null
  t.toAct = next(t, t.button, canAct)
}

/** Splits the pot(s), pays the winners, and leaves the table at showdown. */
function finish(t: Table) {
  const seats = t.seats.map((s, i) => [s, i] as const).filter((x): x is readonly [Seat, number] => !!x[0] && x[0].committed > 0)
  // Return any bet nobody called.
  const top = [...seats].sort((a, b) => b[0].committed - a[0].committed)
  if (top.length > 1 && top[0][0].committed > top[1][0].committed) {
    const extra = top[0][0].committed - top[1][0].committed
    top[0][0].committed -= extra
    top[0][0].stack += extra
  } else if (top.length === 1) {
    top[0][0].stack += top[0][0].committed
    top[0][0].committed = 0
  }
  const live = t.seats.map((s, i) => (s?.inHand ? i : -1)).filter(i => i >= 0)
  const showdown = live.length > 1
  const values = new Map(live.map(i => [i, evaluate([...t.seats[i]!.hole, ...t.board])]))
  // Layer the pots by contribution level; folded chips go in but cannot win.
  const pots: { amount: number; eligible: number[] }[] = []
  let prev = 0
  for (const level of [...new Set(seats.map(([s]) => s.committed))].filter(x => x > 0).sort((a, b) => a - b)) {
    const amount = seats.reduce((sum, [s]) => sum + Math.min(s.committed, level) - Math.min(s.committed, prev), 0)
    const eligible = live.filter(i => t.seats[i]!.committed >= level)
    const last = pots[pots.length - 1]
    if (last && (eligible.length === 0 || last.eligible.join() === eligible.join())) last.amount += amount
    else pots.push({ amount, eligible })
    prev = level
  }
  const order = (i: number) => (i - t.button + MAX_SEATS - 1) % MAX_SEATS // first left of the button gets odd chips
  const result: Result = { pots: [], showdown, hands: {} }
  for (const pot of pots) {
    const best = Math.max(...pot.eligible.map(i => values.get(i)!.score))
    const winners = pot.eligible.filter(i => values.get(i)!.score === best).sort((a, b) => order(a) - order(b))
    const share = Math.floor(pot.amount / winners.length)
    winners.forEach((w, k) => (t.seats[w]!.stack += share + (k < pot.amount - share * winners.length ? 1 : 0)))
    const losers = pot.eligible.filter(i => !winners.includes(i)).map(i => values.get(i)!)
    const runnerUp = losers.sort((a, b) => b.score - a.score)[0]
    result.pots.push({
      amount: pot.amount,
      winners,
      hand: showdown ? values.get(winners[0])!.name : null,
      beats: showdown && runnerUp ? runnerUp.short : null,
    })
  }
  if (showdown) for (const i of live) result.hands[i] = values.get(i)!.name
  t.result = result
  t.street = 'showdown'
  t.toAct = null
  for (const s of t.seats) if (s && s.stack === 0) s.sittingOut = true
}
