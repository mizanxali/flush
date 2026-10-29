import { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { evaluate, rankLabel, suitSymbol } from '../../engine/cards.ts';
import { badgeOf, liveCount, logLine, othersOf, outcome, readyCount, seatStatus, sizing, STREET } from '../../engine/display.ts';
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

const cardText = (cards: string[]) => cards.map(c => rankLabel(c) + suitSymbol(c)).join(' ');

/** A seat: its cards peek over a small plate with the avatar, name and stack. */
function Seat({ v, i, s }: { v: TableView; i: number; s: SeatView }) {
  const secs = useSecondsLeft(v.toAct === i ? v.deadline : null);
  const out = !s.inHand && v.street !== 'idle';
  const turn = v.toAct === i;
  const won = v.street === 'showdown' && v.result?.pots.some(p => p.winners.includes(i));
  return (
    <View style={st.seat}>
      <View style={st.seatCards}>
        {s.cards ? s.cards.map(c => <PlayingCard key={c} card={c} tiny />) : s.hasCards && v.street !== 'showdown' ? [<CardBack key="a" />, <CardBack key="b" />] : null}
      </View>
      <View style={[st.plate, out && { opacity: 0.45 }, turn && { borderColor: C.accent }, won && { borderColor: C.win }]}>
        <Avatar seed={s.avatar} size={26} dim={!s.connected} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={st.row}>
            <Text style={[T.muted, { fontSize: 12, flexShrink: 1 }]} numberOfLines={1}>
              {s.name}
            </Text>
            <Badge kind={badgeOf(v, i)} />
          </View>
          <Text style={[T.text, { fontSize: 14 }, won && T.win]}>{moneyExact(s.stack)}</Text>
        </View>
      </View>
      <Text style={[T.muted, { fontSize: 11, marginTop: 3, color: turn ? C.accent : out ? C.dim : C.muted }]} numberOfLines={1}>
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
  // Equal preset amounts share one choice.
  const presets = new Map<number, string[]>();
  for (const [label, amount] of z.presets) presets.set(amount, [...(presets.get(amount) ?? []), label]);
  return (
    <View style={{ gap: 10 }}>
      <Text style={T.muted}>{secs === null ? 'Your move' : `Your move · ${secs}s`}</Text>
      {open && z.canRaise && (
        <>
          <View style={st.row}>
            <Btn title="−" onPress={() => setTo(z.clamp(to - v.bb))} style={st.step} />
            <Text style={[T.text, { flex: 1, textAlign: 'center', fontSize: 24 }]}>{moneyExact(to)}</Text>
            <Btn title="+" onPress={() => setTo(z.clamp(to + v.bb))} style={st.step} />
          </View>
          <View style={[st.row, { justifyContent: 'space-between' }]}>
            {[...presets].map(([amount, labels]) => (
              <Pressable key={amount} onPress={() => setTo(amount)} hitSlop={8} accessibilityRole="button">
                <Text style={[T.muted, to === amount && { color: C.accent }]}>{labels.join(' · ')}</Text>
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
      {open && <Btn title="Fold" onPress={() => c.act({ type: 'fold' })} />}
    </View>
  );
}

function Waiting({ v, c }: { v: TableView; c: Controls }) {
  const me = v.seats[v.you]!;
  const turn = v.toAct !== null ? v.seats[v.toAct] : null;
  const secs = useSecondsLeft(v.deadline);
  if (v.street === 'showdown' && v.result?.pots.length) {
    const o = outcome(v);
    return (
      <Text style={[T.text, T.win, { fontSize: 16, fontFamily: F.medium }]} numberOfLines={2}>
        {o.who} {moneyExact(o.total)}
        {o.hand ? ` with ${o.hand.toLowerCase()}` : ''}
        {o.beats ? <Text style={T.muted}>{`, beating ${o.beats}`}</Text> : null}
      </Text>
    );
  }
  if (me.stack === 0 && !me.inHand)
    return (
      <View style={{ gap: 8 }}>
        <Text style={T.text}>You're out of chips</Text>
        <Btn primary title={`Rebuy ${moneyExact(v.buyIn)}`} onPress={c.rebuy} />
      </View>
    );
  if (me.sittingOut && !me.inHand)
    return (
      <View style={{ gap: 8 }}>
        <Text style={T.text}>You're sitting out</Text>
        <Btn primary title="Deal me in" onPress={() => c.sit(false)} />
      </View>
    );
  if (v.street === 'idle') {
    const ready = readyCount(v);
    if (!c.start) return <Text style={T.text}>{v.running ? 'Waiting for players' : 'Waiting for the host to start'}</Text>;
    return (
      <View style={{ gap: 10 }}>
        <Text style={T.text}>{ready < 2 ? 'Waiting for players to join' : `${ready} players ready`}</Text>
        <Text style={T.muted}>Phones nearby join from their Join screen. Browsers join by picking this phone under Join → Connect to a phone.</Text>
        {!v.running && <Btn primary title={ready < 2 ? 'Start once two are seated' : 'Start the game'} disabled={ready < 2} onPress={c.start} />}
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

/** What has happened this hand, newest at the bottom, in whatever room the screen has. */
function HandLog({ v }: { v: TableView }) {
  if (!v.log.length) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={[T.caps, { marginBottom: 2 }]}>Hand {v.hand}</Text>
      {v.log.slice(-5).map((e, k, shown) => (
        <Text key={v.log.length - shown.length + k} style={[T.muted, k === shown.length - 1 && { color: C.text }, e.kind === 'win' && T.win]} numberOfLines={1}>
          {logLine(v, e, cardText)}
        </Text>
      ))}
    </View>
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
            Blinds {stakes(v)} · {v.seats.filter(Boolean).length} of {MAX_SEATS} seated{live === 2 && v.street !== 'idle' ? ' · heads up' : ''}
          </Text>
          <Text style={[T.text, { fontSize: 22, marginTop: 2 }]} numberOfLines={1}>
            {v.name}
          </Text>
        </View>
        {me && !me.sittingOut && me.stack > 0 && <Chip onPress={() => c.sit(true)}>Sit out</Chip>}
      </View>

      <View style={st.seats}>
        {othersOf(v).map(i => (
          <Seat key={v.seats[i]!.id} v={v} i={i} s={v.seats[i]!} />
        ))}
        {othersOf(v).length === 0 && <Text style={[T.muted, { paddingVertical: 24 }]}>Nobody else is here yet</Text>}
      </View>

      <View style={[st.row, { gap: 6, marginTop: 10 }]}>
        {[0, 1, 2, 3, 4].map(k => (
          <PlayingCard key={k} card={v.board[k] ?? null} style={{ flex: 1 }} />
        ))}
      </View>
      <View style={[st.row, { justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }]}>
        <Text style={T.muted}>{showdown ? (v.result!.showdown ? 'Showdown' : 'Hand complete') : v.street === 'idle' ? '' : `${STREET[v.street]} · ${live === 2 ? 'heads up' : `${live} players`}`}</Text>
        <View style={[st.row, { alignItems: 'baseline', gap: 8 }]}>
          <Text style={T.muted}>{showdown ? 'Pot awarded' : 'Pot'}</Text>
          <Text style={[T.text, { fontSize: 28 }, showdown && T.win]}>{moneyExact(total)}</Text>
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 0, justifyContent: 'flex-end', overflow: 'hidden', paddingVertical: 8 }}>
        <HandLog v={v} />
      </View>
      <View style={{ marginBottom: 14 }}>{myTurn ? <Actions key={`${v.hand}/${v.board.length}/${v.currentBet}`} v={v} c={c} /> : me ? <Waiting v={v} c={c} /> : null}</View>

      {me && (
        <View style={[st.row, { gap: 14, alignItems: 'center' }]}>
          <View style={{ flex: 1 }} {...swipe.panHandlers}>
            <View style={[st.row, !v.hole.length && { height: 120, justifyContent: 'center' }]}>
              {v.hole.length ? (
                v.hole.map((card, k) => <PlayingCard key={card} card={card} style={[{ width: '52%' }, k ? st.overlap : null]} />)
              ) : (
                <Text style={[T.muted, { textAlign: 'center' }]}>No cards yet</Text>
              )}
            </View>
            {myTurn ? <Text style={[T.muted, { textAlign: 'center', marginTop: 8 }]}>↑ Swipe up to fold</Text> : null}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[st.plate, { padding: 10 }, myTurn && { borderColor: C.accent }, won && { borderColor: C.win }]}>
              <Avatar seed={me.avatar} size={34} />
              <View style={{ flex: 1 }}>
                <View style={st.row}>
                  <Text style={T.muted}>You</Text>
                  <Badge kind={badgeOf(v, v.you)} />
                </View>
                <Text style={[T.text, { fontSize: 22 }, won && T.win]}>{moneyExact(me.stack)}</Text>
              </View>
            </View>
            {myHand && <Text style={[T.muted, { textAlign: 'center' }, won && T.win]}>{myHand}</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  seats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 4, paddingTop: 2 },
  seat: { width: '33.3%', alignItems: 'center', paddingHorizontal: 3 },
  seatCards: { flexDirection: 'row', gap: 2, height: 31, alignItems: 'flex-end', marginBottom: -8, zIndex: 1 },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', padding: 5, backgroundColor: '#181818', borderWidth: 1, borderColor: C.line2, borderRadius: 8 },
  step: { width: 54, paddingHorizontal: 0 },
  overlap: { marginLeft: '-20%', borderLeftWidth: 1, borderLeftColor: '#d6d6d6', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: -3, height: 0 }, elevation: 4 },
  banner: { backgroundColor: '#2e2410', color: '#f3cf8a', fontFamily: F.regular, padding: 10, borderRadius: 6, marginTop: 8, overflow: 'hidden' },
});
