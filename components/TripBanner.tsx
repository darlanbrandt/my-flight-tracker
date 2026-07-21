'use client'

import { Price, TripType, TRIP_TYPE_LABELS } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'

type Props = {
  data: Price[]                    // já filtrado por viagem/rota
  sourceMode: 'manual' | 'auto'
  colors: Record<string, string>
}

// variação considerada "muito grande"
const BIG_PCT = 0.12

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDelta(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

type Move = {
  airline: string
  tripType: TripType
  prev: number
  curr: number
  delta: number
  pct: number
  date: string
}

function computeMoves(rows: Price[]): Move[] {
  const groups: Record<string, Price[]> = {}
  for (const r of rows) {
    ;(groups[`${r.airline}|${r.trip_type}`] ??= []).push(r)
  }

  const moves: Move[] = []
  for (const [key, list] of Object.entries(groups)) {
    const byDate: Record<string, number> = {}
    for (const r of list) {
      if (!(r.date in byDate) || r.total < byDate[r.date]) byDate[r.date] = r.total
    }
    const dates = Object.keys(byDate).sort()
    if (dates.length < 2) continue
    const curr = byDate[dates[dates.length - 1]]
    const prev = byDate[dates[dates.length - 2]]
    const delta = curr - prev
    if (Math.abs(delta) < 0.5 || prev <= 0) continue
    const [airline, tripType] = key.split('|') as [string, TripType]
    moves.push({ airline, tripType, prev, curr, delta, pct: delta / prev, date: dates[dates.length - 1] })
  }
  return moves
}

export default function TripBanner({ data, sourceMode, colors }: Props) {
  const rows = data.filter(r => r.source === sourceMode)
  const moves = computeMoves(rows)
  if (moves.length === 0) return null

  const drops    = moves.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta)
  const bestDrop = drops[0]
  const bigRise  = moves.filter(m => m.delta > 0 && m.pct >= BIG_PCT)
                        .sort((a, b) => b.pct - a.pct)[0]

  // nada relevante: sem queda e sem alta expressiva
  if (!bestDrop && !bigRise) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {bestDrop && (
        <div style={{ ...styles.banner, ...styles.down }}>
          <span style={styles.icon}>📉</span>
          <span>
            <strong style={{ color: colors[bestDrop.airline] }}>{bestDrop.airline}</strong>
            {' · '}{TRIP_TYPE_LABELS[bestDrop.tripType]} caiu{' '}
            <strong>{fmtDelta(bestDrop.delta)}</strong>
            {Math.abs(bestDrop.pct) >= BIG_PCT && (
              <span style={styles.bigTag}>−{Math.round(Math.abs(bestDrop.pct) * 100)}%</span>
            )}
            {' — '}{fmt(bestDrop.prev)} → <strong>{fmt(bestDrop.curr)}</strong>
            {' '}<span style={styles.date}>em {format(parseISO(bestDrop.date), 'dd/MM')}</span>
          </span>
        </div>
      )}

      {bigRise && (
        <div style={{ ...styles.banner, ...styles.up }}>
          <span style={styles.icon}>⚠️</span>
          <span>
            Alta expressiva:{' '}
            <strong style={{ color: colors[bigRise.airline] }}>{bigRise.airline}</strong>
            {' · '}{TRIP_TYPE_LABELS[bigRise.tripType]} subiu{' '}
            <strong>{fmtDelta(bigRise.delta)}</strong>
            <span style={{ ...styles.bigTag, background: 'rgba(220,38,38,.16)', color: 'var(--red)' }}>
              +{Math.round(bigRise.pct * 100)}%
            </span>
            {' — '}{fmt(bigRise.prev)} → <strong>{fmt(bigRise.curr)}</strong>
            {' '}<span style={styles.date}>em {format(parseISO(bigRise.date), 'dd/MM')}</span>
          </span>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderRadius: 12,
    fontSize: 13.5,
    lineHeight: 1.45,
    border: '1px solid var(--border)',
  },
  down: {
    background: 'var(--green-bg)',
    color: '#fff',
    border: '1px solid transparent',
  },
  up: {
    background: 'rgba(220,38,38,.10)',
    color: 'var(--text)',
    border: '1px solid rgba(220,38,38,.30)',
  },
  icon: {
    fontSize: 18,
    flexShrink: 0,
  },
  bigTag: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 6,
    background: 'rgba(255,255,255,.22)',
    marginLeft: 6,
  },
  date: {
    opacity: 0.75,
    fontSize: 12,
  },
}
