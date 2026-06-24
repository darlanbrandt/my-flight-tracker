import { FlightPrice } from '@/lib/supabase'

type Props = { data: FlightPrice[] }

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StatsBar({ data }: Props) {
  if (data.length === 0) return null

  const arajet  = data.filter(r => r.airline === 'Arajet')
  const avianca = data.filter(r => r.airline === 'Avianca')

  function stats(rows: FlightPrice[]) {
    if (!rows.length) return null
    const totals = rows.map(r => r.total)
    return {
      min: Math.min(...totals),
      max: Math.max(...totals),
      avg: totals.reduce((a, b) => a + b, 0) / totals.length,
      count: rows.length,
    }
  }

  const sa = stats(arajet)
  const sv = stats(avianca)

  const cards = [
    { label: 'Arajet — menor', value: sa ? formatBRL(sa.min) : '—', color: 'var(--arajet)' },
    { label: 'Arajet — média',  value: sa ? formatBRL(sa.avg) : '—', color: 'var(--arajet)' },
    { label: 'Avianca — menor', value: sv ? formatBRL(sv.min) : '—', color: 'var(--avianca)' },
    { label: 'Avianca — média',  value: sv ? formatBRL(sv.avg) : '—', color: 'var(--avianca)' },
  ]

  return (
    <div style={styles.grid}>
      {cards.map(c => (
        <div key={c.label} style={styles.card}>
          <p style={{ ...styles.label, color: c.color }}>{c.label}</p>
          <p style={styles.value}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 16px',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: 600,
    fontFamily: 'JetBrains Mono, monospace',
    color: 'var(--text)',
  },
}
