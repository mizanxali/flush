// node --test engine/
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Guest, Host, parse, type Msg, type View } from './session.ts'
import { legal } from './game.ts'

/** An in-memory network: messages queue until flush(), and cross as JSON like the real thing. */
function network() {
  const queue: (() => void)[] = []
  const nodes = new Map<string, { message(from: string, m: Msg): void }>()
  const net = (from: string) => ({
    send(to: string, m: Msg) {
      const text = JSON.stringify(m)
      queue.push(() => nodes.get(to)?.message(from, parse(text)!))
    },
  })
  const flush = () => {
    while (queue.length) queue.shift()!()
  }
  return { nodes, net, flush }
}

test('players find the table, join, play a hand, and only ever see their own cards', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { nodes, net, flush } = network()
  let hostView: View | null = null
  const host = new Host(net('h'), { name: 'Home game', sb: 100, bb: 200, buyIn: 20_000, turnMs: 30_000, nextHandMs: 5_000 }, { id: 'h', name: 'Hana', avatar: 1 }, v => (hostView = v))
  nodes.set('h', host)
  const guests = ['a', 'b'].map(id => {
    const g = new Guest(net(id), { id, name: id.toUpperCase(), avatar: 2 }, () => {})
    nodes.set(id, g)
    return g
  })
  // They link: each side hears of the other.
  for (const g of ['a', 'b']) host.peerUp(g)
  guests.forEach(g => g.peerUp('h'))
  flush()
  assert.deepEqual(guests[0].tables.get('h'), { name: 'Home game', sb: 100, bb: 200, seated: 1, max: 6 })
  guests.forEach(g => g.join('h'))
  flush()
  assert.equal(hostView!.seats.filter(Boolean).length, 3)
  assert.equal(guests[1].view!.you, 2)

  host.start()
  flush()
  const views = () => [hostView!, guests[0].view!, guests[1].view!]
  for (const v of views()) {
    assert.equal(v.street, 'preflop')
    assert.equal(v.hole.length, 2)
    assert.ok(v.seats.every(s => s === null || s.cards === null), 'nobody sees cards before showdown')
  }
  assert.equal(new Set(views().flatMap(v => v.hole)).size, 6)

  // Everyone checks or calls down.
  const players = [host, ...guests]
  for (let n = 0; n < 20 && hostView!.street !== 'showdown'; n++) {
    const who = hostView!.toAct!
    const view = views()[who]
    assert.equal(view.toAct, view.you)
    players[who].act({ type: legal(view, who).canCheck ? 'check' : 'call' })
    flush()
  }
  const end = guests[0].view!
  assert.equal(end.street, 'showdown')
  assert.equal(end.board.length, 5)
  assert.ok(end.seats.every(s => s === null || s.cards?.length === 2), 'showdown reveals live hands')
  assert.equal(end.seats.reduce((n, s) => n + (s?.stack ?? 0), 0), 60_000)

  // The next hand deals itself.
  mock.timers.tick(5_000)
  flush()
  assert.equal(guests[0].view!.hand, 2)
  host.stop()
  mock.timers.reset()
})

test('a player who lets the clock run out is folded and sat out', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { nodes, net, flush } = network()
  let hostView: View | null = null
  const host = new Host(net('h'), { name: 't', sb: 1, bb: 2, buyIn: 200, turnMs: 30_000, nextHandMs: 5_000 }, { id: 'h', name: 'H', avatar: 0 }, v => (hostView = v))
  nodes.set('h', host)
  const g = new Guest(net('a'), { id: 'a', name: 'A', avatar: 0 }, () => {})
  nodes.set('a', g)
  host.peerUp('a')
  g.join('h')
  flush()
  host.start()
  flush()
  // Heads-up: the button (host, seat 0) acts first. Host calls; the guest then sleeps.
  host.act({ type: 'call' })
  flush()
  assert.equal(hostView!.toAct, 1)
  assert.ok(g.view!.deadline! > Date.now())
  mock.timers.tick(30_000)
  flush()
  assert.equal(g.view!.seats[1]!.sittingOut, true)
  assert.equal(g.view!.street, 'flop', 'the big blind had a free check, so the clock checked for them')
  // Illegal or out-of-turn actions change nothing.
  const v = hostView!.v
  g.act({ type: 'raise', to: 1e9 })
  flush()
  assert.equal(hostView!.v, v)
  host.stop()
  mock.timers.reset()
})
