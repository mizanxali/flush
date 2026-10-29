import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Avatar as DiceAvatar, Style } from '@dicebear/core';
import avataaars from '@dicebear/styles/avataaars.json';
import { isRed, rankLabel, suitSymbol, type Card } from '../../engine/cards.ts';

// Same tokens as web/src/index.css: neutral near-black, a brass accent, teal for wins.
export const C = {
  bg: '#111111',
  line: '#242424',
  line2: '#333333',
  text: '#ededed',
  muted: '#8f8f8f',
  dim: '#5c5c5c',
  accent: '#f0b44c',
  accentInk: '#1f1503',
  win: '#57d3be',
  red: '#d9443b',
  card: '#f5f1e8',
  ink: '#1b1e1c',
};

// Bundled Geist faces (assets/fonts). Android picks a face by family name, not fontWeight.
export const F = { regular: 'Geist-Regular', medium: 'Geist-Medium', semibold: 'Geist-SemiBold', mono: 'GeistMono-Medium' };

export const T = StyleSheet.create({
  text: { color: C.text, fontSize: 15, fontFamily: F.regular, fontVariant: ['tabular-nums'] },
  muted: { color: C.muted, fontSize: 13, fontFamily: F.regular },
  caps: { color: C.muted, fontSize: 10, fontFamily: F.medium, letterSpacing: 1.6, textTransform: 'uppercase' },
  win: { color: C.win },
});

const style = new Style(avataaars);

/** A DiceBear avataaar, as Radius draws them. Memoised: one is a few hundred SVG nodes, and seats re-render every clock tick. */
export const Avatar = memo(function Avatar({ seed, size = 44, dim = false }: { seed: number; size?: number; dim?: boolean }) {
  const xml = useMemo(() => new DiceAvatar(style, { seed: String(seed) }).toString(), [seed]);
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
});

export function PlayingCard({ card, style, big = false, tiny = false }: { card: Card | null; style?: StyleProp<ViewStyle>; big?: boolean; tiny?: boolean }) {
  if (!card) return <View style={[s.card, s.empty, style]} />;
  const color = isRed(card) ? C.red : C.ink;
  const rank = tiny ? 11 : big ? 46 : 26;
  return (
    <View style={[s.card, tiny && s.tiny, style]} accessibilityLabel={card}>
      <Text style={{ color, fontSize: rank, lineHeight: rank * 1.1, fontFamily: F.regular }}>{rankLabel(card)}</Text>
      <Text style={{ color, fontSize: tiny ? 10 : rank * 0.75 }}>{suitSymbol(card)}</Text>
    </View>
  );
}

export const CardBack = () => <View style={[s.card, s.tiny, s.back]} />;

export function Badge({ kind }: { kind: 'D' | 'SB' | 'BB' | null }) {
  if (!kind) return null;
  const bg = kind === 'BB' ? C.accent : kind === 'SB' ? '#2b2b2b' : C.text;
  const fg = kind === 'BB' ? C.accentInk : kind === 'SB' ? '#d4d4d4' : C.bg;
  return (
    <View style={[s.badge, { backgroundColor: bg }, kind === 'D' && { borderRadius: 99 }]}>
      <Text style={{ color: fg, fontSize: 9, fontFamily: F.mono }}>{kind}</Text>
    </View>
  );
}

export function Btn({ title, sub, onPress, primary: wantPrimary, disabled, style }: { title: string; sub?: string; onPress: () => void; primary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const primary = wantPrimary && !disabled; // a disabled primary reads as a quiet outline, not dimmed brass
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.btn, primary && s.primary, pressed && { opacity: 0.75 }, disabled && { opacity: 0.4 }, style]}
    >
      <Text style={{ color: primary ? C.accentInk : C.text, fontSize: 16, fontFamily: F.medium }}>{title}</Text>
      {sub ? <Text style={{ color: primary ? '#6b4e14' : C.muted, fontSize: 12, fontFamily: F.regular, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Chip({ children, onPress, on }: { children: ReactNode; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.chip, on && { borderColor: C.accent }]}>
      {typeof children === 'string' ? <Text style={{ color: on ? C.text : C.muted, fontSize: 13, fontFamily: F.regular }}>{children}</Text> : children}
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
  back: { backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: C.card },
  badge: { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2, marginLeft: 5 },
  btn: { minHeight: 52, borderRadius: 6, borderWidth: 1, borderColor: C.line2, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primary: { backgroundColor: C.accent, borderColor: C.accent },
  chip: { borderWidth: 1, borderColor: C.line2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9 },
});
