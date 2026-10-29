import { memo, useEffect, useMemo, useState } from 'react'
import { Avatar as DiceAvatar, Style } from '@dicebear/core'
import avataaars from '@dicebear/styles/avataaars.json'
import { LOGO_MARK } from '../../engine/brand.ts'
import { isRed, rankLabel, suitSymbol, type Card } from '../../engine/cards.ts'

const mark = 'data:image/svg+xml;utf8,' + encodeURIComponent(LOGO_MARK)

export function Logo() {
  return (
    <span className="logo">
      <img src={mark} width="26" height="24" alt="" />
      flush
    </span>
  )
}

const style = new Style(avataaars)

/** A DiceBear avataaar. Memoised: one is a few hundred SVG nodes, and seats re-render every clock tick. */
export const Avatar = memo(function Avatar({ seed, size = 48, dim = false }: { seed: number; size?: number; dim?: boolean }) {
  const src = useMemo(() => 'data:image/svg+xml;utf8,' + encodeURIComponent(new DiceAvatar(style, { seed: String(seed) }).toString()), [seed])
  return <img className="avatar" src={src} width={size} height={size} alt="" style={{ opacity: dim ? 0.45 : 1 }} />
})

/** A classic face: rank and suit in two opposite corners, one large pip in the middle. The tiny size shows the index only. */
export function PlayingCard({ card, size = 'md', className = '' }: { card: Card | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  if (!card) return <div className={`card card-${size} card-empty ${className}`} />
  const index = (
    <span className="idx">
      <b>{rankLabel(card)}</b>
      <i>{suitSymbol(card)}</i>
    </span>
  )
  return (
    <div className={`card card-${size} ${isRed(card) ? 'red' : ''} ${className}`} aria-label={card}>
      {index}
      {size !== 'xs' && <span className="pip">{suitSymbol(card)}</span>}
      {size !== 'xs' && <span className="idx idx-flip">{index.props.children}</span>}
    </div>
  )
}

export const CardBack = ({ size = 'xs' }: { size?: 'xs' | 'sm' }) => <div className={`card card-${size} card-back`} />

export function Badge({ kind }: { kind: 'D' | 'SB' | 'BB' }) {
  return <span className={`badge badge-${kind.toLowerCase()}`}>{kind}</span>
}

/** Seconds left until a local-clock deadline, re-rendering as it ticks. */
export function useSecondsLeft(deadline: number | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}
