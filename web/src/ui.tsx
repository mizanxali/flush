import { memo, useEffect, useMemo, useState } from 'react'
import { Avatar as DiceAvatar, Style } from '@dicebear/core'
import avataaars from '@dicebear/styles/avataaars.json'
import { isRed, rankLabel, suitSymbol, type Card } from '../../engine/cards.ts'

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path fill="var(--accent)" d="M12 2C9 6 4 8.5 4 13a4.5 4.5 0 0 0 7 3.7L10 22h4l-1-5.3A4.5 4.5 0 0 0 20 13c0-4.5-5-7-8-11Z" />
      </svg>
      <span>
        flush<span className="logo-dot">.</span>
      </span>
    </span>
  )
}

const style = new Style(avataaars)

/** A DiceBear avataaar in a circle. Memoised: one is a few hundred SVG nodes, and seats re-render every clock tick. */
export const Avatar = memo(function Avatar({ seed, size = 48, dim = false }: { seed: number; size?: number; dim?: boolean }) {
  const src = useMemo(() => 'data:image/svg+xml;utf8,' + encodeURIComponent(new DiceAvatar(style, { seed: String(seed) }).toString()), [seed])
  return <img className="avatar" src={src} width={size} height={size} alt="" style={{ opacity: dim ? 0.45 : 1 }} />
})

export function PlayingCard({ card, size = 'md', className = '' }: { card: Card | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  if (!card) return <div className={`card card-${size} card-empty ${className}`} />
  return (
    <div className={`card card-${size} ${isRed(card) ? 'red' : ''} ${className}`} aria-label={card}>
      <span className="card-rank">{rankLabel(card)}</span>
      <span className="card-suit">{suitSymbol(card)}</span>
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
