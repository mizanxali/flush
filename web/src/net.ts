// The browser's side of the network: one SDK node, linked to a phone over Web Bluetooth or to
// other browsers over WebRTC (codes swapped by QR). Sessions see peers come and go and messages.
import { parse, type Msg, type Send } from '../../engine/session.ts'
import { APP_ID, loadSdk, type BluetoothCarrier, type EngineEvent, type OfflineNode } from './sdk'
import type { WebRtcCarrier } from '../public/sdk/src/index.js'

export type Listener = { peerUp(id: string): void; peerDown(id: string): void; message(from: string, m: Msg): void }

export class Net implements Send {
  readonly peers = new Set<string>()
  listener: Listener | null = null
  readonly node: OfflineNode
  readonly ble: BluetoothCarrier | null
  readonly rtc: WebRtcCarrier

  private constructor(node: OfflineNode, ble: BluetoothCarrier | null, rtc: WebRtcCarrier) {
    this.node = node
    this.ble = ble
    this.rtc = rtc
    const on = (type: string, f: (e: EngineEvent) => void) => node.addEventListener(type, (e: Event) => f((e as CustomEvent<EngineEvent>).detail))
    on('neighbor_discovered', e => {
      const id = String(e.peer_id)
      if (this.peers.has(id)) return
      this.peers.add(id)
      this.listener?.peerUp(id)
    })
    on('neighbor_lost', e => {
      const id = String(e.peer_id)
      if (!this.peers.delete(id)) return
      this.listener?.peerDown(id)
    })
    on('message_received', e => {
      const m = parse(String(e.content))
      if (m) this.listener?.message(String(e.sender), m)
    })
  }

  static async start(profile: string) {
    const { OfflineNode, BluetoothCarrier, WebRtcCarrier } = await loadSdk()
    // A page that just reloaded can find its old worker still holding the account (W8) for a moment.
    let node: OfflineNode
    for (let attempt = 1; ; attempt++) {
      try {
        node = await OfflineNode.start({ appId: APP_ID, profile, ble: BluetoothCarrier.supported })
        break
      } catch (e) {
        if (attempt === 4 || !/already runs this account/.test(String(e))) throw e
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    return new Net(node, BluetoothCarrier.supported ? new BluetoothCarrier(node) : null, new WebRtcCarrier(node))
  }

  get address() {
    return this.node.address
  }

  send(to: string, m: Msg) {
    this.node.sendMessage(to, JSON.stringify(m)).catch(err => console.warn('send failed', m.t, err))
  }

  /** Opens the browser's Bluetooth chooser (must run inside a click). Resolves to the phone's address. */
  linkPhone = () => this.ble!.request()
}
