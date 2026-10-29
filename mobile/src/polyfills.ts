// Loaded before anything else (index.js). Imports are hoisted, so these can't sit inline there.
import 'react-native-get-random-values'; // crypto.getRandomValues for the deck shuffle

// Hermes has no structuredClone; @dicebear/core only clones JSON with it (as in Radius).
const g = globalThis as { structuredClone?: (v: unknown) => unknown };
g.structuredClone ??= v => JSON.parse(JSON.stringify(v));
