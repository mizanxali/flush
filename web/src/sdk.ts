// The SDK's browser binding is served as-is from public/sdk (see scripts/sync-sdk.sh):
// its worker and wasm resolve beside index.js, which a bundler would break.
import type * as Sdk from '../public/sdk/src/index.js'

export type { OfflineNode, BluetoothCarrier, EngineEvent } from '../public/sdk/src/index.js'

export const APP_ID = 'flush' // must match the phone app: the BLE carrier binds by App tag

let sdk: Promise<typeof Sdk> | undefined
export const loadSdk = () => (sdk ??= import(/* @vite-ignore */ `${location.origin}/sdk/src/index.js`))
