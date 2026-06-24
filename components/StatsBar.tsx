'use client'

import { FlightPrice, Airline, AIRLINE_COLORS } from '@/lib/supabase'

type Props = {
  data: FlightPrice[]
  isNarrow: boolean
}

const AIRLINES: Airline[] = ['Arajet', 'Avianca', 'American']

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDelta(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function getTrend(rows: FlightPrice[]) {
  if (rows.length < 2) return rows.length === 1 ? 'new' : 'none'
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date))
  const delta = sorted[0].total - sorted[1].total
  if (delta < -0.5) return { dir: 'down', delta }
  if (delta > 0.5)  return { dir: 'up',   delta }
  return 'stable'
}

function TrendBadge({ trend }: { trend: ReturnType<typeof getTrend> }) {
  if (trend === 'none') {
    return <span style={{ ...badgeBase, background: 'var(--surface2)', color: 'var(--text3)' }}>—</span>
  }
  if (trend === 'new') {
    return <span style={{ ...badgeBase, background: 'var(--surface2)', color: 'var(--text3)' }}>novo</span>
  }
  if (trend === 'stable') {
    return <span style={{ ...badgeBase, background: 'var(--surface2)', color: 'var(--text3)' }}>→ estável</span>
  }
  const { dir, delta } = trend as { dir: string; delta: number }
  if (dir === 'down') {
    return (
      <span style={{ ...badgeBase, background: 'var(--green-bg)', color: '#fff' }}>
        ↓ {formatDelta(Math.abs(delta))}
      </span>
    )
  }
  return (
    <span style={{ ...badgeBase, background: 'var(--red-bg)', color: '#fff' }}>
      ↑ {formatDelta(delta)}
    </span>
  )
}

const badgeBase: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 7,
  flexShrink: 0,
}

export default function StatsBar({ data, isNarrow }: Props) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isNarrow ? '1fr' : 'repeat(3, minmax(0,1fr))',
      gap: 16,
      marginTop: 18,
    }}>
      {AIRLINES.map(airline => {
        const rows = data.filter(r => r.airline === airline)
        const totals = rows.map(r => r.total)
        const min = totals.length ? Math.min(...totals) : null
        const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null
        const trend = getTrend(rows)
        const color = AIRLINE_COLORS[airline]

        return (
          <div key={airline} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${color}`,
            borderRadius: 16,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
            boxShadow: 'var(--shadow)',
          }}>
            {/* row 1: name + trend */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 15,
                fontWeight: 700,
                color,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {airline}
              </span>
              <TrendBadge trend={trend} />
            </div>

            {/* row 2: min + avg */}
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={statLabel}>MENOR</p>
                <p style={statValue}>{min !== null ? formatBRL(min) : '—'}</p>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={statLabel}>MÉDIA</p>
                <p style={{ ...statValue, fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>
                  {avg !== null ? formatBRL(avg) : '—'}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
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
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
