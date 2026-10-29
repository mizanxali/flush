// Cards are two-character strings: rank then suit, e.g. "As", "Td", "2c".
export type Card = string

const RANKS = '23456789TJQKA'
const SUITS = 'shdc'
const NAMES = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace']
const PLURAL = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces']

export const rankOf = (c: Card) => RANKS.indexOf(c[0])
export const suitOf = (c: Card) => c[1]
export const isRed = (c: Card) => c[1] === 'h' || c[1] === 'd'
export const rankLabel = (c: Card) => (c[0] === 'T' ? '10' : c[0])
// U+FE0E asks for the text glyph: Android otherwise draws ♦ and ♠ as emoji.
export const suitSymbol = (c: Card) => (({ s: '♠', h: '♥', d: '♦', c: '♣' })[c[1]] ?? '?') + '\uFE0E'

/** A fresh deck in a uniformly random order (Fisher–Yates over crypto randomness). */
export function shuffledDeck(): Card[] {
  const deck = [...RANKS].flatMap(r => [...SUITS].map(s => r + s))
  const buf = new Uint32Array(1)
  // Browsers and Node have it; React Native gets it from react-native-get-random-values.
  const { crypto } = globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }
  for (let i = deck.length - 1; i > 0; i--) {
    // Rejection sampling: no modulo bias.
    const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1)
    let x: number
    do x = crypto.getRandomValues(buf)[0]
    while (x >= limit)
    const j = x % (i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export type HandValue = {
  score: number // higher wins; equal scores split
  cat: number // 0 high card … 8 straight flush
  name: string // "Ace-high flush"
  short: string // "an ace-high flush", for "Beats …"
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const article = (s: string) => (/^[aeiou]/.test(s) ? 'an ' : 'a ') + s

function describe(cat: number, r: number[]): Pick<HandValue, 'name' | 'short'> {
  const [a, b] = r
  switch (cat) {
    case 8:
      return a === 12 ? { name: 'Royal flush', short: 'a royal flush' } : { name: `${cap(NAMES[a])}-high straight flush`, short: `${article(NAMES[a])}-high straight flush` }
    case 7:
      return { name: `Four of a kind, ${PLURAL[a]}`, short: `four ${PLURAL[a]}` }
    case 6:
      return { name: `Full house, ${PLURAL[a]} full of ${PLURAL[b]}`, short: `${PLURAL[a]} full of ${PLURAL[b]}` }
    case 5:
      return { name: `${cap(NAMES[a])}-high flush`, short: `${article(NAMES[a])}-high flush` }
    case 4:
      return { name: `${cap(NAMES[a])}-high straight`, short: `${article(NAMES[a])}-high straight` }
    case 3:
      return { name: `Three of a kind, ${PLURAL[a]}`, short: `three ${PLURAL[a]}` }
    case 2:
      return { name: `Two pair, ${PLURAL[a]} and ${PLURAL[b]}`, short: `two pair, ${PLURAL[a]} and ${PLURAL[b]}` }
    case 1:
      return { name: `Pair of ${PLURAL[a]}`, short: `a pair of ${PLURAL[a]}` }
    default:
      return { name: `${cap(NAMES[a])} high`, short: `${NAMES[a]} high` }
  }
}

/** Ranks grouped by count (desc), then rank (desc): [[rank, count], …]. */
function groups(cards: Card[]): [number, number][] {
  const counts = new Map<number, number>()
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1)
  return [...counts].sort((x, y) => y[1] - x[1] || y[0] - x[0])
}

const score = (cat: number, r: number[]) => r.slice(0, 5).reduce((s, x, i) => s + x * 13 ** (4 - i), cat * 13 ** 5)

function eval5(cards: Card[]): { score: number; cat: number; r: number[] } {
  const g = groups(cards)
  const flush = cards.every(c => suitOf(c) === suitOf(cards[0]))
  const ranks = g.map(([r]) => r)
  let high = -1
  if (g.length === 5) {
    if (ranks[0] - ranks[4] === 4) high = ranks[0]
    else if (ranks[0] === 12 && ranks[1] === 3) high = 3 // A-2-3-4-5
  }
  let cat: number
  let r = ranks
  if (high >= 0) [cat, r] = [flush ? 8 : 4, [high]]
  else if (g[0][1] === 4) cat = 7
  else if (g[0][1] === 3 && g[1][1] === 2) cat = 6
  else if (flush) cat = 5
  else if (g[0][1] === 3) cat = 3
  else if (g[0][1] === 2 && g[1][1] === 2) cat = 2
  else if (g[0][1] === 2) cat = 1
  else cat = 0
  return { score: score(cat, r), cat, r }
}

/** Best hand from 2–7 cards. Below five cards only pairs/trips/quads count. */
export function evaluate(cards: Card[]): HandValue {
  let best: { score: number; cat: number; r: number[] }
  if (cards.length < 5) {
    const g = groups(cards)
    const cat = g[0][1] === 4 ? 7 : g[0][1] === 3 ? 3 : g[0][1] === 2 ? (g[1]?.[1] === 2 ? 2 : 1) : 0
    const r = g.map(([x]) => x)
    best = { score: score(cat, r), cat, r }
  } else {
    best = fives(cards).map(eval5).reduce((x, y) => (y.score > x.score ? y : x))
  }
  return { score: best.score, cat: best.cat, ...describe(best.cat, best.r) }
}

/** Every 5-card subset (21 for seven cards). */
function fives(cards: Card[], from = 0, pick: Card[] = []): Card[][] {
  if (pick.length === 5) return [pick]
  const out: Card[][] = []
  for (let i = from; i <= cards.length - (5 - pick.length); i++) out.push(...fives(cards, i + 1, [...pick, cards[i]]))
  return out
}
