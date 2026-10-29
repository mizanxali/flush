import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Avatar as DiceAvatar, Style } from '@dicebear/core';
import avataaars from '@dicebear/styles/avataaars.json';
import { LOGO_MARK } from '../../engine/brand.ts';
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
  caps: { color: C.muted, fontSize: 12, fontFamily: F.regular },
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

export function Logo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <SvgXml xml={LOGO_MARK} width={26} height={24} />
      <Text style={{ color: C.text, fontSize: 24, fontFamily: F.semibold, letterSpacing: -1.1 }}>flush</Text>
    </View>
  );
}

/**
 * A classic face: rank and suit in two opposite corners, one large pip in the middle, all sized from
 * the card's measured width. `tiny` shows the index only. A card that arrives deals in.
 */
export function PlayingCard({ card, style, tiny = false }: { card: Card | null; style?: StyleProp<ViewStyle>; tiny?: boolean }) {
  const [w, setW] = useState(tiny ? 22 : 0);
  const deal = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!card) return;
    deal.setValue(0);
    Animated.timing(deal, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [card, deal]);
  if (!card) return <View style={[s.card, s.empty, style]} />;
  const color = isRed(card) ? C.red : C.ink;
  const index = (size: number) => (
    <>
      <Text style={{ color, fontSize: size * 0.25, lineHeight: size * 0.26, fontFamily: F.semibold }}>{rankLabel(card)}</Text>
      <Text style={{ color, fontSize: size * 0.19, lineHeight: size * 0.21 }}>{suitSymbol(card)}</Text>
    </>
  );
  const motion = { opacity: deal, transform: [{ translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] };
  if (tiny)
    return (
      <Animated.View style={[s.card, s.tiny, style, motion]} accessibilityLabel={card}>
        <Text style={{ color, fontSize: 10, lineHeight: 11, fontFamily: F.semibold }}>{rankLabel(card)}</Text>
        <Text style={{ color, fontSize: 9, lineHeight: 10 }}>{suitSymbol(card)}</Text>
      </Animated.View>
    );
  return (
    <Animated.View style={[s.card, style, motion]} onLayout={e => setW(e.nativeEvent.layout.width)} accessibilityLabel={card}>
      {w > 0 && (
        <>
          <View style={{ position: 'absolute', top: w * 0.06, left: w * 0.07, alignItems: 'center' }}>{index(w)}</View>
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color, fontSize: w * 0.46, lineHeight: w * 0.5 }}>{suitSymbol(card)}</Text>
          </View>
          <View style={{ position: 'absolute', bottom: w * 0.06, right: w * 0.07, alignItems: 'center', transform: [{ rotate: '180deg' }] }}>{index(w)}</View>
        </>
      )}
    </Animated.View>
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

export function Btn({ title, onPress, primary: wantPrimary, disabled, style }: { title: string; onPress: () => void; primary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const primary = wantPrimary && !disabled; // a disabled primary reads as a quiet outline, not dimmed brass
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.btn, primary && s.primary, pressed && { opacity: 0.75 }, disabled && { opacity: 0.4 }, style]}
    >
      <Text style={{ color: primary ? C.accentInk : C.text, fontSize: 16, fontFamily: F.medium }}>{title}</Text>
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
  card: { backgroundColor: C.card, borderRadius: 8, aspectRatio: 0.72, overflow: 'hidden' },
  tiny: { width: 22, height: 31, aspectRatio: undefined, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  empty: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line2 },
  back: { backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: C.card },
  badge: { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2, marginLeft: 5 },
  btn: { minHeight: 52, borderRadius: 6, borderWidth: 1, borderColor: C.line2, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primary: { backgroundColor: C.accent, borderColor: C.accent },
  chip: { borderWidth: 1, borderColor: C.line2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9 },
});
