// node --test engine/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, shuffledDeck, type Card } from './cards.ts'
import { act, leave, legal, newTable, sit, startHand, type Table } from './game.ts'

const hand = (s: string) => evaluate(s.split(' '))

test('evaluator names and orders hands', () => {
  assert.equal(hand('Ah Jh Kd 4h 5s 8h Qh').name, 'Ace-high flush')
  assert.equal(hand('Kh Kc Kd 4h 5s 8h Qh').name, 'Three of a kind, kings')
  assert.equal(hand('Kh Kc Kd 4h 5s 8h Qh').short, 'three kings')
  assert.equal(hand('Ah Kh Qh Jh Th 2c 3d').name, 'Royal flush')
  assert.equal(hand('Ah 2d 3c 4s 5h 9c Kd').name, 'Five-high straight')
  assert.equal(hand('Kh Kc Kd 4h 4s 8h Qh').name, 'Full house, kings full of fours')
  assert.equal(hand('As Ad').name, 'Pair of aces')
  const order = ['Ah Kd 9c 7s 3h', 'Ah Ad 9c 7s 3h', 'Ah Ad 9c 9s 3h', 'Ah Ad Ac 7s 3h', 'Ah 2d 3c 4s 5h', '2h 6h 9h Jh Kh', 'Ah Ad Ac 7s 7h', 'Ah Ad Ac As 3h', '9h Th Jh Qh Kh']
  order.reduce((prev, h) => (assert.ok(hand(h).score > prev, h), hand(h).score), -1)
  // Kickers decide; identical best five split.
  assert.ok(hand('Ah Ad Kc 7s 3h').score > hand('Ah Ad Qc 7s 3h').score)
  assert.equal(hand('2c 3d Ah Kh Qh Jh Th').score, hand('4c 5d Ah Kh Qh Jh Th').score)
})

test('shuffle is a permutation', () => {
  assert.equal(new Set(shuffledDeck()).size, 52)
})

/** A deck that deals the given cards: holes in deal order (from the small blind, two rounds), then the board. */
function rigged(holes: Card[][], board: Card[]): Card[] {
  const draw = [...holes.map(h => h[0]), ...holes.map(h => h[1]), ...board]
  const rest = shuffledDeck().filter(c => !draw.includes(c))
  return [...rest, ...draw.reverse()]
}

function table(stacks: number[], sb = 5, bb = 10): Table {
  const t = newTable(sb, bb, 1000)
  stacks.forEach((s, i) => {
    sit(t, `p${i}`, `P${i}`, i)
    t.seats[i]!.stack = s
  })
  return t
}

const chips = (t: Table) => t.seats.reduce((n, s) => n + (s ? s.stack + s.committed : 0), 0)

test('heads-up: button posts small blind, acts first, uncalled bet comes back', () => {
  const t = table([1000, 1000])
  startHand(t)
  assert.equal(t.button, 0)
  assert.equal(t.sbSeat, 0)
  assert.equal(t.toAct, 0)
  act(t, 0, { type: 'raise', to: 100 })
  act(t, 1, { type: 'fold' })
  assert.equal(t.street, 'showdown')
  assert.deepEqual(t.seats.filter(s => s).map(s => s!.stack), [1010, 990])
  assert.equal(t.result!.pots[0].amount, 20)
})

test('big blind gets its option, then the flop goes to the first seat after the button', () => {
  const t = table([1000, 1000, 1000])
  startHand(t) // button 0, sb 1, bb 2
  act(t, 0, { type: 'call' })
  act(t, 1, { type: 'call' })
  assert.equal(t.toAct, 2)
  assert.ok(legal(t, 2).canCheck)
  act(t, 2, { type: 'check' })
  assert.equal(t.street, 'flop')
  assert.equal(t.board.length, 3)
  assert.equal(t.toAct, 1)
})

test('side pots: the short all-in wins the main pot, the next best wins the side pot', () => {
  const t = table([100, 500, 500])
  // Deal order from the small blind (seat 1): 1, 2, 0.
  startHand(t, rigged([['Kd', 'Kc'], ['7d', '2c'], ['Ah', 'As']], ['Kh', '9s', '4d', '3c', '8h']))
  act(t, 0, { type: 'raise', to: 100 }) // all in
  act(t, 1, { type: 'call' })
  act(t, 2, { type: 'raise', to: 300 })
  act(t, 1, { type: 'call' })
  for (const street of ['flop', 'turn', 'river']) {
    assert.equal(t.street, street)
    act(t, t.toAct!, { type: 'check' })
    act(t, t.toAct!, { type: 'check' })
  }
  assert.equal(t.street, 'showdown')
  // Seat 1 trips beat seat 0's aces; seat 0 still only wins the main pot it could cover.
  assert.deepEqual(t.result!.pots.map(p => [p.amount, p.winners]), [[300, [1]], [400, [1]]])
  assert.deepEqual(t.seats.filter(s => s).map(s => s!.stack), [0, 900, 200])
  assert.equal(t.result!.pots[0].beats, 'a pair of aces')
  assert.ok(t.seats[0]!.sittingOut, 'busted player sits out')
})

test('an all-in short of a full raise lets earlier actors call but not re-raise', () => {
  const t = table([1000, 40, 1000])
  startHand(t) // button 0, sb 1, bb 2
  act(t, 0, { type: 'raise', to: 30 }) // raise of 20
  act(t, 1, { type: 'raise', to: 40 }) // all in, raise of only 10
  assert.ok(legal(t, 2).canRaise, 'the big blind had not acted: may raise')
  act(t, 2, { type: 'call' })
  assert.equal(t.toAct, 0)
  assert.equal(legal(t, 0).canRaise, false)
  assert.equal(legal(t, 0).toCall, 10)
  assert.throws(() => act(t, 0, { type: 'raise', to: 100 }))
  act(t, 0, { type: 'call' })
  assert.equal(t.street, 'flop')
})

test('random play never creates or loses chips', () => {
  let n = 0
  for (let game = 0; game < 40; game++) {
    const players = 2 + (game % 5)
    const t = table(Array.from({ length: players }, () => 200 + Math.floor(Math.random() * 1800)))
    let total = chips(t)
    for (let h = 0; h < 50; h++) {
      for (const s of t.seats)
        if (s && s.stack === 0) {
          s.stack = 1000
          s.sittingOut = false
          total += 1000
        }
      startHand(t)
      while (t.toAct !== null) {
        const i = t.toAct
        const l = legal(t, i)
        const r = Math.random()
        if (r < 0.15 && !l.canCheck) act(t, i, { type: 'fold' })
        else if (r < 0.35 && l.canRaise) act(t, i, { type: 'raise', to: l.minTo + Math.floor(Math.random() * (l.maxTo - l.minTo + 1)) })
        else act(t, i, { type: l.canCheck ? 'check' : 'call' })
      }
      assert.equal(t.street, 'showdown')
      assert.equal(t.seats.reduce((x, s) => x + (s?.stack ?? 0), 0), total, `hand ${t.hand}`)
      n++
    }
  }
  assert.equal(n, 2000)
})

test('a player who leaves mid-hand folds, their chips stay in the pot, and the seat frees next hand', () => {
  const t = table([1000, 1000, 1000])
  startHand(t) // button 0, sb 1, bb 2; seat 0 to act
  act(t, 0, { type: 'raise', to: 50 })
  leave(t, 1) // the small blind leaves out of turn
  assert.equal(t.toAct, 2)
  act(t, 2, { type: 'fold' })
  assert.equal(t.street, 'showdown')
  assert.equal(t.seats[0]!.stack, 1015)
  startHand(t)
  assert.equal(t.seats[1], null)
})
