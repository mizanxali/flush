import { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { evaluate } from '../../engine/cards.ts';
import { badgeOf, liveCount, othersOf, outcome, readyCount, seatStatus, sizing, STREET } from '../../engine/display.ts';
import { MAX_SEATS, type Action } from '../../engine/game.ts';
import { moneyExact, pot, stakes, type SeatView, type View as TableView } from '../../engine/session.ts';
import { Avatar, Badge, Btn, C, CardBack, Chip, F, PlayingCard, T, useSecondsLeft } from './ui';

export type Controls = {
  act(a: Action): void;
  rebuy(): void;
  sit(out: boolean): void;
  leave(): void;
  start?: () => void; // host only
  banner?: string | null;
};

function Opponent({ v, i, s }: { v: TableView; i: number; s: SeatView }) {
  const secs = useSecondsLeft(v.toAct === i ? v.deadline : null);
  const out = !s.inHand && v.street !== 'idle';
  const won = v.street === 'showdown' && v.result?.pots.some(p => p.winners.includes(i));
  return (
    <View style={st.opp}>
      <Avatar seed={s.avatar} size={36} dim={out || !s.connected} />
      <View style={st.row}>
        <Text style={[T.text, { fontSize: 13, color: out ? C.dim : C.text }]} numberOfLines={1}>
          {s.name}
        </Text>
        <Badge kind={badgeOf(v, i)} />
      </View>
      <Text style={[T.text, { color: won ? C.win : out ? C.dim : C.text }]}>{moneyExact(s.stack)}</Text>
      {s.cards ? (
        <View style={st.row}>
          {s.cards.map(c => (
            <PlayingCard key={c} card={c} tiny style={{ marginHorizontal: 1 }} />
          ))}
        </View>
      ) : s.hasCards && v.street !== 'showdown' ? (
        <View style={[st.row, { gap: 2 }]}>
          <CardBack />
          <CardBack />
        </View>
      ) : null}
      <Text style={[T.muted, { fontSize: 11, color: v.toAct === i ? C.accent : out ? C.dim : C.muted }]} numberOfLines={1}>
        {seatStatus(v, i, s, secs)}
      </Text>
    </View>
  );
}

function Actions({ v, c }: { v: TableView; c: Controls }) {
  const z = sizing(v);
  const [to, setTo] = useState(z.initial);
  const [open, setOpen] = useState(false);
  const secs = useSecondsLeft(v.deadline);
  const me = v.seats[v.you]!;
  const raise = to === z.maxTo ? `All in ${moneyExact(to)}` : `${z.opening ? 'Bet' : 'Raise to'} ${moneyExact(to)}`;
  return (
    <View style={{ gap: 10 }}>
      <Text style={T.muted}>{secs === null ? 'Your move' : `Turn remaining · ${secs}s`}</Text>
      {open && z.canRaise && (
        <>
          <View style={st.row}>
            <Btn title="−" onPress={() => setTo(z.clamp(to - v.bb))} style={st.step} />
            <Text style={[T.text, { flex: 1, textAlign: 'center', fontSize: 24 }]}>{moneyExact(to)}</Text>
            <Btn title="+" onPress={() => setTo(z.clamp(to + v.bb))} style={st.step} />
          </View>
          <View style={st.presets}>
            {z.presets.map(([label, amount]) => (
              <Pressable key={label} onPress={() => setTo(amount)} style={[st.preset, to === amount && { borderColor: C.accent }]}>
                <Text style={[T.muted, to === amount && { color: C.text }]}>{label}</Text>
                <Text style={T.text}>{moneyExact(amount)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <View style={[st.row, { gap: 8 }]}>
        {z.canCheck ? (
          <Btn title="Check" onPress={() => c.act({ type: 'check' })} style={{ flex: 1 }} />
        ) : (
          <Btn title={`${z.toCall === me.stack ? 'Call all in' : 'Call'} ${moneyExact(z.toCall)}`} onPress={() => c.act({ type: 'call' })} style={{ flex: 1 }} />
        )}
        {z.canRaise && <Btn title={raise} primary onPress={() => c.act({ type: 'raise', to })} style={{ flex: 1.2 }} />}
        <Btn title={open ? '↓' : '↑'} onPress={() => setOpen(!open)} style={{ width: 54, paddingHorizontal: 0 }} />
      </View>
      {open && <Btn title="Fold" sub="Give up this hand" onPress={() => c.act({ type: 'fold' })} />}
    </View>
  );
}

function Result({ v }: { v: TableView }) {
  if (!v.result?.pots.length) return null;
  const o = outcome(v);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[T.text, T.win, { fontSize: 16 }]}>
        {o.who}
        {o.hand ? ` · ${o.hand}` : ''}
      </Text>
      <View style={st.box}>
        {o.showdown ? (
          <>
            <Text style={T.caps}>Winning hand</Text>
            <Text style={[T.text, { fontSize: 28, fontFamily: F.medium, letterSpacing: -0.8 }]}>{o.hand}</Text>
            {o.beats ? <Text style={T.muted}>Beats {o.beats}</Text> : null}
          </>
        ) : (
          <Text style={[T.text, { fontSize: 20 }]}>Everyone else folded</Text>
        )}
        <Text style={[T.text, T.win]}>{moneyExact(o.total)} pot awarded</Text>
        {o.sidePots.map((p, k) => (
          <Text key={k} style={T.muted}>
            Side pot {moneyExact(p.amount)} → {p.to}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Waiting({ v, c }: { v: TableView; c: Controls }) {
  const me = v.seats[v.you]!;
  const turn = v.toAct !== null ? v.seats[v.toAct] : null;
  const secs = useSecondsLeft(v.deadline);
  if (me.stack === 0 && !me.inHand) return <Btn primary title={`Rebuy ${moneyExact(v.buyIn)}`} sub="You're out of chips" onPress={c.rebuy} />;
  if (me.sittingOut) return <Btn primary title="I'm back" sub="You're sitting out. Deal me in next hand" onPress={() => c.sit(false)} />;
  if (v.street === 'idle') {
    const ready = readyCount(v);
    if (!c.start) return <Text style={T.text}>{v.running ? 'Waiting for players' : 'Waiting for the host to start'}</Text>;
    return (
      <View style={{ gap: 10 }}>
        <Text style={T.text}>{ready < 2 ? 'Waiting for players to join' : `${ready} players ready`}</Text>
        <Text style={T.muted}>Phones nearby join from their Join screen. Browsers join by picking this phone under Join → Connect to a phone.</Text>
        {!v.running && <Btn primary title="Start the game" sub={ready < 2 ? 'Needs two players' : 'Deal the first hand'} disabled={ready < 2} onPress={c.start} />}
      </View>
    );
  }
  return (
    <Text style={T.muted}>
      {turn ? `Waiting for ${turn.name}${secs !== null ? ` · ${secs}s` : ''}` : 'Waiting'}
      {!me.inHand ? '. You folded; you are in again next hand.' : ''}
    </Text>
  );
}

export function Table({ v, c }: { v: TableView; c: Controls }) {
  const me = v.seats[v.you];
  const live = liveCount(v);
  const myTurn = v.toAct === v.you && v.street !== 'showdown';
  const showdown = v.street === 'showdown' && !!v.result;
  const won = showdown && v.result!.pots.some(p => p.winners.includes(v.you));
  const myHand = v.hole.length === 2 ? evaluate([...v.hole, ...v.board]).name : null;
  const total = showdown ? v.result!.pots.reduce((n, p) => n + p.amount, 0) : pot(v);
  // Created once; reads the current turn through a ref so a re-render never interrupts a swipe.
  const latest = useRef({ myTurn, act: c.act });
  latest.current = { myTurn, act: c.act };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -10,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -60 && latest.current.myTurn) latest.current.act({ type: 'fold' });
      },
    }),
  ).current;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16 }}>
      {c.banner ? <Text style={st.banner}>{c.banner}</Text> : null}
      <View style={[st.row, { paddingVertical: 10, gap: 10 }]}>
        <Pressable onPress={c.leave} hitSlop={12} accessibilityLabel="Leave table">
          <Text style={{ color: C.muted, fontSize: 22 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={T.caps} numberOfLines={1}>
            {v.name} · {v.seats.filter(Boolean).length} of {MAX_SEATS} seated{live === 2 && v.street !== 'idle' ? ' · heads up' : ''}
          </Text>
          <Text style={[T.text, { fontSize: 22, marginTop: 2 }]}>{stakes(v)}</Text>
        </View>
        {me && !me.sittingOut && me.stack > 0 && <Chip onPress={() => c.sit(true)}>Sit out</Chip>}
      </View>

      <View style={st.opps}>
        {othersOf(v).map(i => (
          <Opponent key={v.seats[i]!.id} v={v} i={i} s={v.seats[i]!} />
        ))}
        {othersOf(v).length === 0 && <Text style={[T.muted, { paddingVertical: 24 }]}>Nobody else is here yet</Text>}
      </View>

      <View style={[st.row, { gap: 6, marginTop: 6 }]}>
        {[0, 1, 2, 3, 4].map(k => (
          <PlayingCard key={k} card={v.board[k] ?? null} style={{ flex: 1 }} />
        ))}
      </View>
      <View style={[st.row, { justifyContent: 'flex-end', alignItems: 'baseline', gap: 8, marginTop: 10 }]}>
        <Text style={T.muted}>{showdown ? 'Pot awarded' : 'Total pot'}</Text>
        <Text style={[T.text, { fontSize: 30 }, showdown && T.win]}>{moneyExact(total)}</Text>
      </View>
      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Text style={T.muted}>{showdown ? (v.result!.showdown ? 'Showdown' : 'Hand complete') : v.street === 'idle' ? '' : `${STREET[v.street]} · ${live === 2 ? 'heads up' : `${live} players`}`}</Text>
        <Text style={T.muted}>{v.hand > 0 ? `Hand ${v.hand}` : ''}</Text>
      </View>

      <View style={{ flex: 1, minHeight: 12 }} />
      <View style={{ marginBottom: 14 }}>{showdown ? <Result v={v} /> : myTurn ? <Actions key={`${v.hand}/${v.board.length}/${v.currentBet}`} v={v} c={c} /> : me ? <Waiting v={v} c={c} /> : null}</View>

      {me && (
        <View style={[st.row, { gap: 14, alignItems: 'stretch' }]}>
          <View style={{ flex: 1 }} {...swipe.panHandlers}>
            <View style={st.row}>
              {v.hole.length ? (
                v.hole.map((card, k) => <PlayingCard key={card} card={card} big style={[{ width: '62%' }, k ? st.overlap : null]} />)
              ) : (
                <Text style={T.muted}>No cards this hand</Text>
              )}
            </View>
            {myTurn ? <Text style={[T.muted, { textAlign: 'center', marginTop: 8 }]}>↑ Swipe up to fold</Text> : null}
          </View>
          <View style={[st.box, { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, won && { borderColor: '#2f6d62' }]}>
            <View style={st.row}>
              <Text style={[T.muted, won && T.win]}>{myHand ?? 'You'}</Text>
              <Badge kind={badgeOf(v, v.you)} />
            </View>
            <Avatar seed={me.avatar} size={44} />
            <Text style={[T.text, { fontSize: 24 }]}>{moneyExact(me.stack)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  opps: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 12, paddingVertical: 8 },
  opp: { width: '33.3%', alignItems: 'center', gap: 2 },
  box: { borderWidth: 1, borderColor: C.line2, borderRadius: 8, padding: 14, gap: 6 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: { width: '48.8%', flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: C.line2, borderRadius: 5, padding: 10 },
  step: { width: 54, paddingHorizontal: 0 },
  overlap: { marginLeft: '-24%', borderLeftWidth: 1, borderLeftColor: '#d6d6d6', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: -3, height: 0 }, elevation: 4 },
  banner: { backgroundColor: '#2e2410', color: '#f3cf8a', fontFamily: F.regular, padding: 10, borderRadius: 6, marginTop: 8, overflow: 'hidden' },
});
