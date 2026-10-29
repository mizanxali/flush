# Third-party notices

The code in this repository is licensed under MIT-0 (see [LICENSE](./LICENSE)),
except for the material listed below, which keeps its own license. Dependencies
installed from npm, CocoaPods or Maven keep their own licenses and are not
covered by this repository's LICENSE.

## Offline Protocol SDK

`@offline-protocol/mesh-sdk` is not included in this repository; it is
installed from npm. The browser binding (`bindings/web` in the SDK repository)
is not included either: `web/scripts/sync-sdk.sh` copies it into
`web/public/sdk/` at build time, and that directory is ignored by git. Both are
dual-licensed: AGPL-3.0-only, or a commercial license from Offline Protocol,
Inc. See the SDK's `LICENSE` and `LICENSE-COMMERCIAL.md`, and
https://www.offlineprotocol.com/docs/operations/licensing.

## Fonts

`mobile/assets/fonts/` and `mobile/android/app/src/main/assets/fonts/` contain
Geist and Geist Mono by Vercel, licensed under the SIL Open Font License 1.1.
The license text is in `mobile/assets/Geist-OFL.txt`. The web app installs the
same fonts from npm (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`).

## DiceBear and Avataaars

`mobile/patches/@dicebear+core+10.7.0.patch` modifies
[DiceBear](https://github.com/dicebear/dicebear), licensed under the MIT
License (Copyright (c) 2026 Florian Körner). The avatars use DiceBear's
"avataaars" style, designed by Pablo Stanley and
[free for personal and commercial use](https://avataaars.com/); it is
installed from npm (`@dicebear/styles`).

## React Native project files

The native iOS and Android project files (`mobile/ios`, `mobile/android`) are
generated from the React Native app template (MIT License, Copyright (c) Meta
Platforms, Inc. and affiliates). The Gradle wrapper scripts and
`gradle-wrapper.jar` are part of Gradle and are licensed under the Apache
License 2.0. `debug.keystore` is the standard, publicly known React Native
debug signing key: use it for local testing only, never for a release build.
