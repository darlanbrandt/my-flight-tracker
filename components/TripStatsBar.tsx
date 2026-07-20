'use client'

import { Price, TripType, TRIP_TYPE_LABELS } from '@/lib/supabase'

type Props = {
  data: Price[]                       // já filtrado por viagem/rota
  tripType: TripType
  colors: Record<string, string>
  sourceMode: 'manual' | 'auto'
  isNarrow: boolean
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDelta(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function getTrend(rows: Price[]) {
  if (rows.length < 2) return rows.length === 1 ? 'new' : 'none'
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date))
  const delta = sorted[0].total - sorted[1].total
  if (delta < -0.5) return { dir: 'down', delta }
  if (delta > 0.5)  return { dir: 'up',   delta }
  return 'stable'
}

function TrendBadge({ trend }: { trend: ReturnType<typeof getTrend> }) {
  if (trend === 'none')   return <span style={{ ...badgeBase, background: 'var(--surface2)', color: 'var(--text3)' }}>—</span>
  if (trend === 'new')    return <span style={{ ...badgeBase, background: 'var(--surface2)', color: 'var(--text3)' }}>novo</span>
  if (trend === 'stable') return <span style={{ ...badgeBase, background: 'var(--surface2)', color: 'var(--text3)' }}>→</span>
  const { dir, delta } = trend as { dir: string; delta: number }
  if (dir === 'down') return <span style={{ ...badgeBase, background: 'var(--green-bg)', color: '#fff' }}>↓ {formatDelta(Math.abs(delta))}</span>
  return <span style={{ ...badgeBase, background: 'var(--red-bg)', color: '#fff' }}>↑ {formatDelta(delta)}</span>
}

const badgeBase: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 7,
  flexShrink: 0,
}

export default function TripStatsBar({ data, tripType, colors, sourceMode, isNarrow }: Props) {
  const rows = data.filter(r => r.trip_type === tripType && r.source === sourceMode)
  if (rows.length === 0) return null

  // agrega por companhia e ranqueia pela menor média — os 3 melhores viram cards
  const byAirline: Record<string, Price[]> = {}
  for (const r of rows) {
    ;(byAirline[r.airline] ??= []).push(r)
  }

  const ranked = Object.entries(byAirline)
    .map(([airline, list]) => {
      const totals = list.map(r => r.total)
      return {
        airline,
        rows: list,
        min: Math.min(...totals),
        avg: totals.reduce((a, b) => a + b, 0) / totals.length,
        count: list.length,
      }
    })
    .sort((a, b) => a.avg - b.avg)

  const top = ranked.slice(0, 3)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isNarrow ? '1fr' : `repeat(${top.length}, minmax(0,1fr))`,
      gap: 16,
      marginTop: 18,
    }}>
      {top.map((s, i) => {
        const color = colors[s.airline]
        return (
          <div key={s.airline} style={{ ...styles.card, borderTop: `3px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...styles.rank, background: color }}>{i + 1}º</span>
                <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700, color }}>
                  {s.airline}
                </span>
              </div>
              <TrendBadge trend={getTrend(s.rows)} />
            </div>

            <p style={styles.cardSub}>
              {TRIP_TYPE_LABELS[tripType]} · {s.count} registro{s.count !== 1 ? 's' : ''}
            </p>

            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <p style={statLabel}>MENOR</p>
                <p style={statValue}>{formatBRL(s.min)}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={statLabel}>MÉDIA</p>
                <p style={{ ...statValue, fontWeight: 500, color: 'var(--text2)' }}>
                  {formatBRL(s.avg)}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: 'var(--shadow)',
  },
  cardSub: {
    fontSize: 11.5,
    color: 'var(--text3)',
  },
  rank: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10.5,
    fontWeight: 700,
    color: '#fff',
    padding: '2px 7px',
    borderRadius: 6,
    flexShrink: 0,
  },
}

const statLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text3)',
  marginBottom: 3,
}

const statValue: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
