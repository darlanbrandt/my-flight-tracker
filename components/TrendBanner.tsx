'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TrendAlert = {
  airline: string
  origin: string
  destination: string
  todayPrice: number
  avg7d: number
  changePercent: number
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function TrendBanner() {
  const [alerts, setAlerts] = useState<TrendAlert[]>([])

  useEffect(() => {
    async function calcTrends() {
      const { data } = await supabase
        .from('flight_prices')
        .select('date, airline, origin, destination, total')
        .ilike('notes', 'Automático%')
        .order('date', { ascending: false })
        .limit(200)

      if (!data || data.length === 0) return

      // Agrupa por rota, mantendo os 8 mais recentes
      const grouped: Record<string, typeof data> = {}
      for (const row of data) {
        const key = `${row.airline}|${row.origin}|${row.destination}`
        if (!grouped[key]) grouped[key] = []
        if (grouped[key].length < 8) grouped[key].push(row)
      }

      const found: TrendAlert[] = []

      for (const [key, rows] of Object.entries(grouped)) {
        if (rows.length < 3) continue // poucos dados

        const [airline, origin, destination] = key.split('|')
        const today = rows[0].total
        const prev  = rows.slice(1)
        const avg7d = prev.reduce((sum, r) => sum + r.total, 0) / prev.length
        const changePercent = ((today - avg7d) / avg7d) * 100

        if (changePercent <= -5) {
          found.push({ airline, origin, destination, todayPrice: today, avg7d, changePercent })
        }
      }

      found.sort((a, b) => a.changePercent - b.changePercent)
      setAlerts(found)
    }

    calcTrends()
  }, [])

  if (alerts.length === 0) return null

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <span style={{ fontSize: 16 }}>📉</span>
        <span style={styles.title}>Tendência de baixa detectada</span>
        <span style={styles.sub}>Preços sem bagagem — confirme no site da companhia</span>
      </div>
      <div style={styles.list}>
        {alerts.map(a => (
          <div key={`${a.airline}-${a.origin}-${a.destination}`} style={styles.item}>
            <span style={styles.route}>
              <strong>{a.airline}</strong> {a.origin} → {a.destination}
            </span>
            <span style={styles.prices}>
              hoje {formatBRL(a.todayPrice)}
              <span style={styles.vs}>vs média 7d {formatBRL(a.avg7d)}</span>
            </span>
            <span style={styles.badge}>
              {a.changePercent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'rgba(34,197,94,0.06)',
    border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--green)',
  },
  sub: {
    fontSize: 11,
    color: 'var(--text3)',
    marginLeft: 4,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  route: {
    fontSize: 13,
    color: 'var(--text)',
    minWidth: 180,
  },
  prices: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    color: 'var(--text2)',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  vs: {
    color: 'var(--text3)',
  },
  badge: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--green)',
    background: 'rgba(34,197,94,0.12)',
    padding: '2px 8px',
    borderRadius: 99,
  },
}
