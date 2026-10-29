import { useEffect, useReducer, useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { rollAvatar } from '../engine/avatar.ts';
import { DEFAULTS, Guest, Host, stakes, type Me } from '../engine/session.ts';
import { Net } from './src/net';
import { Table, type Controls } from './src/Table';
import { Avatar, Btn, C, Chip, F, Logo, T } from './src/ui';

type Profile = Omit<Me, 'id'>;
type Mode = { k: 'home' } | { k: 'host'; host: Host } | { k: 'join'; guest: Guest };

const STAKES = [
  [10, 20],
  [25, 50],
  [100, 200],
  [200, 500],
];
const KEY = 'flush.me';

export default function App() {
  const [net, setNet] = useState<Net | null>(null);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Profile | null>(null);
  const [mode, setMode] = useState<Mode>({ k: 'home' });
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(raw => JSON.parse(raw ?? 'null'))
      .catch(() => null)
      .then(saved =>
        setMe(saved?.name ? saved : { name: `Player ${1000 + Math.floor(Math.random() * 9000)}`, avatar: rollAvatar() }),
      );
    Net.start().then(setNet, e => setError(String(e?.message ?? e)));
  }, []);
  useEffect(() => {
    if (me) AsyncStorage.setItem(KEY, JSON.stringify(me));
  }, [me]);
  useEffect(() => {
    if (!net) return;
    net.listener = mode.k === 'host' ? mode.host : mode.k === 'join' ? mode.guest : null;
    return () => {
      net.listener = null;
    };
  }, [net, mode]);

  const identity = (): Me => ({ id: net!.address, name: me!.name.trim() || 'Player', avatar: me!.avatar });

  let screen: React.ReactNode;
  if (error) screen = <Text style={[T.text, s.pad, { color: '#ff8a8a' }]}>The network node did not start: {error}</Text>;
  else if (!net || !me) screen = <Text style={[T.muted, s.pad]}>Starting…</Text>;
  else if (mode.k === 'host') {
    const h = mode.host;
    const c: Controls = {
      act: h.act,
      rebuy: h.rebuyMe,
      sit: h.sitMe,
      start: () => h.start(),
      leave: () =>
        Alert.alert('Close the table?', 'Everyone at the table will be sent back.', [
          { text: 'Keep playing', style: 'cancel' },
          {
            text: 'Close',
            style: 'destructive',
            onPress: () => {
              h.close();
              setMode({ k: 'home' });
            },
          },
        ]),
    };
    screen = <Table v={h.view} c={c} />;
  } else if (mode.k === 'join' && mode.guest.view) {
    const g = mode.guest;
    const c: Controls = {
      act: g.act,
      rebuy: g.rebuyMe,
      sit: g.sitMe,
      leave: () =>
        Alert.alert('Leave the table?', undefined, [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => g.leaveTable() },
        ]),
      banner: g.hostLost ? 'Lost the connection to the host. Reconnecting…' : null,
    };
    screen = <Table v={g.view!} c={c} />;
  } else if (mode.k === 'join') {
    screen = <Join guest={mode.guest} onBack={() => setMode({ k: 'home' })} />;
  } else {
    screen = (
      <Home
        me={me}
        setMe={setMe}
        onHost={(name, sb, bb, bbs) => setMode({ k: 'host', host: new Host(net, { name, sb, bb, buyIn: bb * bbs, ...DEFAULTS }, identity(), bump, net.peers) })}
        onJoin={() => setMode({ k: 'join', guest: new Guest(net, identity(), bump, net.peers) })}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>{screen}</SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({ me, setMe, onHost, onJoin }: { me: Profile; setMe: (p: Profile) => void; onHost: (name: string, sb: number, bb: number, bbs: number) => void; onJoin: () => void }) {
  const [hosting, setHosting] = useState(false);
  const [name, setName] = useState('');
  const [stake, setStake] = useState(2);
  const [bbs, setBbs] = useState(100);
  return (
    <ScrollView contentContainerStyle={[s.pad, { gap: 20 }]} keyboardShouldPersistTaps="handled">
      <Logo />
      <View style={[s.row, { gap: 16 }]}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar seed={me.avatar} size={64} />
          <Chip onPress={() => setMe({ ...me, avatar: rollAvatar() })}>↻ New</Chip>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={T.caps}>Your name</Text>
          <TextInput style={s.input} value={me.name} maxLength={16} onChangeText={t => setMe({ ...me, name: t })} placeholderTextColor={C.dim} />
        </View>
      </View>
      <Text style={[T.text, { fontSize: 24, lineHeight: 30 }]}>No-limit hold'em with the people in the room. No internet needed.</Text>
      {!hosting ? (
        <View style={{ gap: 12 }}>
          <Btn primary title="Host a table" onPress={() => setHosting(true)} />
          <Btn title="Join a table" onPress={onJoin} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={T.caps}>Table name</Text>
          <TextInput style={s.input} placeholder={`${me.name}'s table`} placeholderTextColor={C.dim} value={name} onChangeText={setName} maxLength={24} />
          <Text style={T.caps}>Blinds</Text>
          <View style={s.wrap}>
            {STAKES.map(([sb, bb], k) => (
              <Chip key={k} on={stake === k} onPress={() => setStake(k)}>
                {stakes({ sb, bb })}
              </Chip>
            ))}
          </View>
          <Text style={T.caps}>Buy-in</Text>
          <View style={s.wrap}>
            {[50, 100, 200].map(n => (
              <Chip key={n} on={bbs === n} onPress={() => setBbs(n)}>
                {`${n} big blinds`}
              </Chip>
            ))}
          </View>
          <Btn primary title="Open the table" onPress={() => onHost(name.trim() || `${me.name}'s table`, STAKES[stake][0], STAKES[stake][1], bbs)} />
          <Btn title="Back" onPress={() => setHosting(false)} />
          <Text style={T.muted}>Phones nearby join over Bluetooth or Wi-Fi. Browsers (Chrome) join by picking this phone. Keep flush open while you host.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Join({ guest, onBack }: { guest: Guest; onBack: () => void }) {
  const tables = [...guest.tables];
  return (
    <ScrollView contentContainerStyle={[s.pad, { gap: 14 }]}>
      <View style={[s.row, { gap: 12 }]}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back">
          <Text style={{ color: C.muted, fontSize: 22 }}>←</Text>
        </Pressable>
        <View>
          <Text style={T.caps}>Join</Text>
          <Text style={[T.text, { fontSize: 22 }]}>Tables nearby</Text>
        </View>
      </View>
      {guest.full && <Text style={{ color: '#ff8a8a' }}>That table is full.</Text>}
      {guest.closed && <Text style={T.muted}>The host closed the table.</Text>}
      {tables.length === 0 && <Text style={T.muted}>Looking for tables… Make sure the host has flush open with a table running, and is within a few metres.</Text>}
      {tables.map(([id, t]) => (
        <View key={id} style={[s.row, s.tableRow]}>
          <View style={{ flex: 1 }}>
            <Text style={T.text}>{t.name}</Text>
            <Text style={T.muted}>
              Blinds {stakes(t)} · {t.seated} of {t.max} seated
            </Text>
          </View>
          <Btn primary title="Join" disabled={t.seated >= t.max} onPress={() => guest.join(id)} style={{ minHeight: 44, paddingHorizontal: 22 }} />
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pad: { padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: C.line2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 17, fontFamily: F.regular },
  tableRow: { borderWidth: 1, borderColor: C.line2, borderRadius: 8, padding: 14, gap: 12 },
});
