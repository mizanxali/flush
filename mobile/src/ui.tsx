import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { avatar } from '../../engine/avatar.ts';
import { isRed, rankLabel, suitSymbol, type Card } from '../../engine/cards.ts';

export const C = {
  bg: '#1b1b1b',
  line: '#2f2f2f',
  line2: '#3d3d3d',
  text: '#f1f1f1',
  muted: '#8b8b8b',
  dim: '#5f5f5f',
  accent: '#b9ccd5',
  accentInk: '#0f1a1f',
  win: '#8fdba8',
  pink: '#e8487a',
  red: '#e5484d',
  card: '#f7f7f7',
  ink: '#2a2a2a',
};

export const T = StyleSheet.create({
  text: { color: C.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  muted: { color: C.muted, fontSize: 13 },
  caps: { color: C.muted, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
  win: { color: C.win },
});

export function Avatar({ seed, size = 44, dim = false }: { seed: number; size?: number; dim?: boolean }) {
  const px = size / 12;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }}>
      {avatar(seed).flatMap((row, y) =>
        row.map((c, x) => (c ? <View key={`${x},${y}`} style={{ position: 'absolute', left: x * px, top: y * px, width: px + 0.5, height: px + 0.5, backgroundColor: c }} /> : null)),
      )}
    </View>
  );
}

export function PlayingCard({ card, style, big = false, tiny = false }: { card: Card | null; style?: StyleProp<ViewStyle>; big?: boolean; tiny?: boolean }) {
  if (!card) return <View style={[s.card, s.empty, style]} />;
  const color = isRed(card) ? C.red : C.ink;
  const rank = tiny ? 11 : big ? 46 : 26;
  return (
    <View style={[s.card, tiny && s.tiny, style]} accessibilityLabel={card}>
      <Text style={{ color, fontSize: rank, lineHeight: rank * 1.1 }}>{rankLabel(card)}</Text>
      <Text style={{ color, fontSize: tiny ? 10 : rank * 0.75 }}>{suitSymbol(card)}</Text>
    </View>
  );
}

export const CardBack = () => <View style={[s.card, s.tiny, s.back]} />;

export function Badge({ kind }: { kind: 'D' | 'SB' | 'BB' | null }) {
  if (!kind) return null;
  const bg = kind === 'BB' ? C.pink : kind === 'SB' ? '#c9d4dc' : '#8c3a55';
  const fg = kind === 'BB' ? '#fff' : kind === 'SB' ? '#1c2a33' : '#f4c9d6';
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 9, fontWeight: '700' }}>{kind}</Text>
    </View>
  );
}

export function Btn({ title, sub, onPress, primary, disabled, style }: { title: string; sub?: string; onPress: () => void; primary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.btn, primary && s.primary, pressed && { opacity: 0.75 }, disabled && { opacity: 0.4 }, style]}
    >
      <Text style={{ color: primary ? C.accentInk : C.text, fontSize: 16, fontWeight: '500' }}>{title}</Text>
      {sub ? <Text style={{ color: primary ? '#3d5059' : C.muted, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Chip({ children, onPress, on }: { children: ReactNode; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.chip, on && { borderColor: '#cfcfcf' }]}>
      {typeof children === 'string' ? <Text style={{ color: on ? C.text : C.muted, fontSize: 13 }}>{children}</Text> : children}
    </Pressable>
  );
}

/** Seconds left until a local-clock deadline, re-rendering as it ticks. */
export function useSecondsLeft(deadline: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'space-between', aspectRatio: 0.72 },
  tiny: { width: 22, height: 31, aspectRatio: undefined, borderRadius: 3, paddingHorizontal: 2, paddingVertical: 1, alignItems: 'center' },
  empty: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line2 },
  back: { backgroundColor: '#d8d8d8', borderWidth: 2, borderColor: '#f2f2f2' },
  badge: { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2, marginLeft: 5 },
  btn: { minHeight: 54, borderRadius: 28, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primary: { backgroundColor: C.accent, borderColor: C.accent },
  chip: { borderWidth: 1, borderColor: C.line2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9 },
});
