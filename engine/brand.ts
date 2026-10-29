// The flush mark: five cards fanned from one corner, a flush. Plain SVG so both apps can draw it.
const fan = [-30, -15, 0, 15, 30]
  .map(a => `<rect x="9" y="3" width="6" height="12" rx="1.4" transform="rotate(${a} 12 18)" fill="#f0b44c" stroke="#111111" stroke-width="1.1"/>`)
  .join('')

export const LOGO_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 22">${fan}</svg>`
