#!/usr/bin/env bash
# Copies the SDK's browser binding (built from source; not on npm yet) into public/sdk.
# The page and worker load it as plain modules, so Vite never bundles it.
set -euo pipefail
SDK_DIR="${SDK_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)/offline-protocol-sdk}"
OUT="$(dirname "$0")/../public/sdk"
[ -f "$SDK_DIR/bindings/web/pkg/offline_protocol_web_bg.wasm" ] || { echo "build the web binding first: bash $SDK_DIR/bindings/web/scripts/build.sh" >&2; exit 1; }
rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$SDK_DIR/bindings/web/src" "$SDK_DIR/bindings/web/pkg" "$OUT/"
echo "synced $(git -C "$SDK_DIR" rev-parse --short HEAD) into public/sdk"
