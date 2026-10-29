// Spike: host a table. Seat nearby devices (phones or browsers linked over BLE) into one group,
// broadcast state to it, and log what comes back.
import { useEffect, useRef, useState } from 'react';
import { Button, PermissionsAndroid, Platform, ScrollView, StatusBar, Text, View } from 'react-native';
import { OfflineProtocol, type ProtocolEvent } from '@offline-protocol/mesh-sdk';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const APP_ID = 'flush'; // must match the web app: the browser binds the BLE service by App tag
const NOISY = new Set(['diagnostic', 'network_metrics', 'convergence_diag', 'peer_rssi', 'dors_score_updated']);

async function grantAndroid() {
  if (Platform.OS !== 'android') return;
  const P = PermissionsAndroid.PERMISSIONS;
  await PermissionsAndroid.requestMultiple(
    Number(Platform.Version) >= 33
      ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.BLUETOOTH_ADVERTISE, P.NEARBY_WIFI_DEVICES]
      : Number(Platform.Version) >= 31
        ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.BLUETOOTH_ADVERTISE, P.ACCESS_FINE_LOCATION]
        : [P.ACCESS_FINE_LOCATION],
  );
}

export default function App() {
  const proto = useRef<OfflineProtocol | null>(null);
  const [address, setAddress] = useState('starting…');
  const [neighbors, setNeighbors] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const seq = useRef(0);
  const say = (line: string) => setLog(l => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 300));

  useEffect(() => {
    const p = new OfflineProtocol({
      appId: APP_ID,
      profile: 'host',
      transports: {
        ble: { enabled: true },
        wifiDirect: { enabled: Platform.OS === 'android', autoAccept: true },
        internet: { enabled: false },
      },
      dors: { preferOnline: false },
    });
    proto.current = p;
    p.on('all', (ev: ProtocolEvent) => {
      if (ev.type === 'neighbor_discovered') setNeighbors(n => (n.includes(ev.peer_id) ? n : [...n, ev.peer_id]));
      if (ev.type === 'neighbor_lost') setNeighbors(n => n.filter(x => x !== ev.peer_id));
      if (!NOISY.has(ev.type)) say(`${ev.type} ${JSON.stringify(ev)}`);
    });
    grantAndroid()
      .then(() => p.start())
      .then(() => p.localAddress())
      .then(a => setAddress(a ?? 'no address'))
      .catch(err => say(`start failed: ${err}`));
    return () => {
      p.stop();
    };
  }, []);

  const createTable = () =>
    proto.current
      ?.meshCreateGroup('flush table')
      .then(g => {
        setGroupId(g.groupId);
        say(`created ${g.groupId}`);
      })
      .catch(err => say(`create failed: ${err}`));

  const seat = (peer: string) =>
    groupId &&
    proto.current
      ?.meshInviteToGroup(groupId, peer)
      .then(() => say(`invited ${peer}`))
      .catch(err => say(`invite failed: ${err}`));

  const broadcast = () =>
    groupId &&
    proto.current
      ?.meshSendGroupMessage(groupId, JSON.stringify({ t: 'state', seq: ++seq.current, at: Date.now() }))
      .then(ids => say(`broadcast ${seq.current} → ${ids.length} members`))
      .catch(err => say(`broadcast failed: ${err}`));

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1b1b1b', padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 22 }}>flush · host spike</Text>
        <Text style={{ color: '#aaa', fontSize: 11 }} selectable>
          {address}
        </Text>
        <Text style={{ color: '#aaa', marginTop: 8 }}>table: {groupId ?? 'none'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Create table" onPress={createTable} disabled={!!groupId} />
          <Button title="Broadcast" onPress={broadcast} disabled={!groupId} />
        </View>
        {neighbors.map(n => (
          <View key={n} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#ddd', flex: 1, fontSize: 11 }}>{n}</Text>
            <Button title="Seat" onPress={() => seat(n)} disabled={!groupId} />
          </View>
        ))}
        <ScrollView style={{ flex: 1, marginTop: 8 }}>
          <Text style={{ color: '#ccc', fontSize: 10, fontFamily: 'Menlo' }}>{log.join('\n')}</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
