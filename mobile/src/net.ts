// The phone's side of the network: one SDK node over Bluetooth LE, Wi-Fi Direct and the local
// network. Browsers reach it over Web Bluetooth, with this phone as the GATT peripheral.
import { MessagePriority, OfflineProtocol, type ProtocolEvent } from '@offline-protocol/mesh-sdk';
import { PermissionsAndroid, Platform } from 'react-native';
import { parse, type Msg, type Send } from '../../engine/session.ts';

export const APP_ID = 'flush'; // must match the web app: browsers bind the BLE service by App tag

export type Listener = { peerUp(id: string): void; peerDown(id: string): void; message(from: string, m: Msg): void };

async function grantAndroid() {
  if (Platform.OS !== 'android') return;
  const P = PermissionsAndroid.PERMISSIONS;
  const v = Number(Platform.Version);
  await PermissionsAndroid.requestMultiple(
    v >= 33
      ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.BLUETOOTH_ADVERTISE, P.NEARBY_WIFI_DEVICES]
      : v >= 31
        ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.BLUETOOTH_ADVERTISE, P.ACCESS_FINE_LOCATION]
        : [P.ACCESS_FINE_LOCATION],
  );
}

export class Net implements Send {
  readonly peers = new Set<string>();
  listener: Listener | null = null;
  address = '';
  private readonly p: OfflineProtocol;

  private constructor(p: OfflineProtocol) {
    this.p = p;
    p.on('all', (e: ProtocolEvent) => {
      if (e.type === 'neighbor_discovered' || e.type === 'neighbor_lost' || e.type === 'secure_session_established' || e.type === 'message_failed')
        console.log('[flush]', e.type, JSON.stringify(e));
      if (e.type === 'neighbor_discovered') {
        if (this.peers.has(e.peer_id)) return;
        this.peers.add(e.peer_id);
        this.listener?.peerUp(e.peer_id);
      } else if (e.type === 'neighbor_lost') {
        if (!this.peers.delete(e.peer_id)) return;
        this.listener?.peerDown(e.peer_id);
      } else if (e.type === 'message_received') {
        const m = parse(e.content);
        console.log('[flush] message', e.sender.slice(0, 12), m?.t, this.listener ? '' : '(no listener)');
        if (m) this.listener?.message(e.sender, m);
      }
    });
  }

  static async start() {
    await grantAndroid();
    const p = new OfflineProtocol({
      appId: APP_ID,
      profile: 'flush',
      transports: {
        ble: { enabled: true },
        wifiDirect: { enabled: Platform.OS === 'android', autoAccept: true },
        internet: { enabled: false },
      },
      dors: { preferOnline: false },
    });
    const net = new Net(p);
    await p.start();
    net.address = (await p.localAddress()) ?? '';
    return net;
  }

  send(to: string, m: Msg) {
    this.p
      .sendMessage({ recipient: to, content: JSON.stringify(m), priority: MessagePriority.High })
      .catch(err => console.warn('send failed', m.t, err));
  }
}
