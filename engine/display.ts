// What the table screens show, shared by the web and phone apps.
import { legal, MAX_SEATS } from './game.ts'
import { money, pot, type SeatView, type View } from './session.ts'

export const STREET: Record<string, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', idle: '' }

export function badgeOf(v: View, i: number): 'D' | 'SB' | 'BB' | null {
  if (v.street === 'idle') return null
  if (i === v.bbSeat) return 'BB'
  if (i === v.sbSeat) return 'SB'
  if (i === v.button) return 'D'
  return null
}

/** The line under a player's stack. */
export function seatStatus(v: View, i: number, s: SeatView, secs: number | null): string {
  if (s.left) return 'Left'
  if (v.toAct === i) return secs === null ? 'Thinking' : `Thinking · ${secs}s`
  if (v.street === 'showdown' && v.result?.hands[i]) return v.result.hands[i]
  if (!s.connected) return 'Offline'
  if (s.stack === 0 && !s.inHand) return 'Out of chips'
  if (s.sittingOut) return 'Sitting out'
  if (v.street === 'idle') return 'Waiting'
  if (v.street === 'showdown') return s.inHand ? 'Takes the pot' : s.last === 'Fold' ? 'Folded' : ''
  if (!s.inHand) return s.last === 'Fold' ? 'Folded' : 'Next hand'
  if (s.allIn) return 'All in'
  if (s.last && s.bet > 0 && s.last !== 'Check') return `${s.last} · ${money(s.bet)}`
  return s.last ?? 'Waiting'
}

/** Other seats, clockwise from the viewer. */
export const othersOf = (v: View) => [...Array(MAX_SEATS - 1)].map((_, k) => (v.you + 1 + k) % MAX_SEATS).filter(i => v.seats[i])

export const liveCount = (v: View) => v.seats.filter(s => s?.inHand).length

/** Bet sizing for the viewer: legal range, presets, and clamping to whole small blinds. */
export function sizing(v: View) {
  const l = legal(v, v.you)
  const total = pot(v)
  const clamp = (x: number) => Math.min(l.maxTo, Math.max(l.minTo, Math.round(x / v.sb) * v.sb))
  // A pot-sized raise: call, then raise by the pot as it would stand after the call.
  const potTo = (f: number) => clamp(v.currentBet + f * (total + l.toCall))
  const presets: [string, number][] = [
    ['Min', l.minTo],
    ['½ pot', potTo(0.5)],
    ['Pot', potTo(1)],
    ['All in', l.maxTo],
  ]
  return { ...l, clamp, presets, initial: l.canRaise ? potTo(0.5) : 0, opening: v.currentBet === 0 }
}

/** The showdown summary, from the viewer's side. */
export function outcome(v: View) {
  const r = v.result!
  const main = r.pots[0]
  const name = (w: number) => (w === v.you ? 'You' : (v.seats[w]?.name ?? 'Someone'))
  const names = main?.winners.map(name) ?? []
  return {
    total: r.pots.reduce((n, p) => n + p.amount, 0),
    youWon: r.pots.some(p => p.winners.includes(v.you)),
    who: names.length > 1 ? `${names.join(' and ')} split` : names[0] === 'You' ? 'You win' : `${names[0]} wins`,
    hand: main?.hand ?? null,
    beats: main?.beats ?? null,
    showdown: r.showdown,
    sidePots: r.pots.slice(1).map(p => ({ amount: p.amount, to: p.winners.map(w => (w === v.you ? 'you' : name(w))).join(', ') })),
  }
}

export const readyCount = (v: View) => v.seats.filter(s => s && s.stack > 0 && !s.sittingOut).length
