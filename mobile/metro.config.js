const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// The poker engine lives beside this app, shared with the web app.
const engine = path.resolve(__dirname, '../engine');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [engine],
  // engine/ has no node_modules of its own; Babel helpers it needs come from this app's.
  resolver: { nodeModulesPaths: [path.resolve(__dirname, 'node_modules')] },
});
