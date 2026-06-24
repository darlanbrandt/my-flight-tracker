'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { FlightPrice } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Props = { data: FlightPrice[] }

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PriceChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div style={styles.empty}>
        Nenhum dado para exibir ainda. Adicione registros acima.
      </div>
    )
  }

  // Build chart data: one entry per date, columns for each airline
  const byDate: Record<string, { date: string; Arajet?: number; Avianca?: number }> = {}

  for (const row of data) {
    if (!byDate[row.date]) byDate[row.date] = { date: row.date }
    byDate[row.date][row.airline] = row.total
  }

  const chartData = Object.values(byDate).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={styles.tooltip}>
        <p style={styles.tooltipDate}>
          {format(parseISO(label), "dd 'de' MMM", { locale: ptBR })}
        </p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
            <span style={{ fontWeight: 600 }}>{p.name}:</span>{' '}
            {formatBRL(p.value)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={d => format(parseISO(d), 'dd/MM')}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: 'var(--text-2)', paddingTop: 12 }}
          />
          <Line
            type="monotone"
            dataKey="Arajet"
            stroke="#e8433a"
            strokeWidth={2}
            dot={{ r: 3, fill: '#e8433a' }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Avianca"
            stroke="#f5a623"
            strokeWidth={2}
            dot={{ r: 3, fill: '#f5a623' }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 16px 8px',
  },
  empty: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: 40,
    textAlign: 'center',
    color: 'var(--text-3)',
    fontSize: 13,
  },
  tooltip: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border-2)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
  },
  tooltipDate: {
    color: 'var(--text-2)',
    fontWeight: 600,
    marginBottom: 4,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}
