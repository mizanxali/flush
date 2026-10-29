// Avatars are DiceBear "avataaars" drawn by each app from this seed (Radius uses the same style).
// The seed is a number so the table protocol carries it as one.
export const rollAvatar = () => Math.floor(Math.random() * 2 ** 31)
