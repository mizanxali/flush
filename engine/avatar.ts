// Pixel portraits from a seed: a 12x12 grid of colours ('' = transparent).
const SKIN = ['#f2d0a9', '#e0ac7e', '#c68a5c', '#9c6644', '#7a4a2e', '#5a3622']
const HAIR = ['#1c1c1c', '#4a2f1b', '#8a5a2b', '#d9b26f', '#b8b8b8', '#c2452d', '#2d3e8c']
const SHIRT = ['#3d5a80', '#6b4e9b', '#2a7f62', '#9b3d4e', '#5c5c5c', '#b5651d']
const DARK = '#141414'

export const AVATARS = 64

function rng(seed: number) {
  let x = (seed * 2654435761 + 1) >>> 0
  return (n: number) => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) % n
  }
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0')
  return `#${c(16)}${c(8)}${c(0)}`
}

export function avatar(seed: number): string[][] {
  const r = rng(seed + 7)
  const g = Array.from({ length: 12 }, () => Array<string>(12).fill(''))
  const paint = (row: number, from: number, to: number, c: string) => {
    for (let x = from; x <= to; x++) g[row][x] = c
  }
  const skin = SKIN[r(SKIN.length)]
  const hair = HAIR[r(HAIR.length)]
  const shirt = SHIRT[r(SHIRT.length)]
  // Face, jaw, neck, shoulders.
  for (let y = 2; y <= 8; y++) paint(y, 3, 8, skin)
  paint(9, 4, 7, skin)
  paint(10, 5, 6, shade(skin, 0.8))
  paint(11, 2, 9, shirt)
  g[11][5] = g[11][6] = shade(shirt, 0.7)
  g[6][9] = shade(skin, 0.9) // ear
  // Hair or headwear.
  switch (r(5)) {
    case 0: // short
      paint(1, 3, 8, hair), paint(2, 3, 8, hair), (g[3][3] = hair)
      break
    case 1: // spiky
      for (const x of [3, 5, 7, 8]) g[0][x] = hair
      paint(1, 2, 9, hair), paint(2, 3, 8, hair), (g[3][3] = g[3][8] = hair)
      break
    case 2: // long
      paint(1, 3, 8, hair), paint(2, 2, 9, hair)
      for (let y = 3; y <= 9; y++) g[y][2] = g[y][9] = hair
      break
    case 3: // beanie
      paint(0, 4, 7, shade(shirt, 1.2)), paint(1, 3, 8, shade(shirt, 1.2)), paint(2, 2, 9, shade(shirt, 0.8))
      break
    default: // cap with a brim
      paint(0, 4, 8, hair), paint(1, 3, 8, hair), paint(2, 3, 10, shade(hair, 0.7))
  }
  // Eyes.
  switch (r(4)) {
    case 0: // shades
      paint(5, 3, 8, DARK), (g[5][4] = g[5][7] = '#333')
      break
    case 1: // glasses
      paint(5, 3, 8, '#d8d8d8'), (g[5][4] = g[5][7] = DARK)
      break
    default:
      g[5][4] = g[5][7] = DARK
      g[4][4] = g[4][7] = shade(hair, 0.9) // brows
  }
  g[6][6] = shade(skin, 0.85) // nose
  // Mouth.
  if (r(2)) paint(8, 5, 6, shade(skin, 0.6))
  else (g[7][4] = g[7][7] = shade(skin, 0.6)), paint(8, 5, 6, shade(skin, 0.6))
  if (r(4) === 0) paint(9, 4, 7, hair) // beard
  return g
}
