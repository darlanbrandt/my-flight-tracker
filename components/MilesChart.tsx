'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Price, TripType, TRIP_TYPE_LABELS } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Props = {
  data: Price[]                       // já filtrado por viagem/rota (só miles)
  tripType: TripType
  colors: Record<string, string>      // cor por programa
  isNarrow: boolean
}

function fmtPts(v: number) {
  return v.toLocaleString('pt-BR') + ' pts'
}

export default function MilesChart({ data, tripType, colors, isNarrow }: Props) {
  const filtered = data.filter(r => r.trip_type === tripType)
  if (filtered.length === 0) {
    return <div style={styles.card}><p style={styles.empty}>Sem resgates para {TRIP_TYPE_LABELS[tripType].toLowerCase()}.</p></div>
  }

  const programs = Array.from(new Set(filtered.map(r => r.program))).sort()

  const byDate: Record<string, Record<string, number>> = {}
  for (const row of filtered) {
    if (!byDate[row.date]) byDate[row.date] = {}
    const prev = byDate[row.date][row.program]
    if (prev === undefined || row.miles_total < prev) byDate[row.date][row.program] = row.miles_total
  }
  const chartData = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, vals]) => ({ date, ...vals }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={styles.tooltip}>
        <p style={styles.tooltipDate}>{format(parseISO(label), "dd 'de' MMM", { locale: ptBR })}</p>
        {[...payload].sort((a: any, b: any) => a.value - b.value).map((p: any) => (
          <p key={p.name} style={{ color: p.color, margin: '2px 0', fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{p.name}:</span> {fmtPts(p.value)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <p style={styles.cardTitle}>Variação de pontos</p>
          <p style={styles.cardSub}>{TRIP_TYPE_LABELS[tripType]}</p>
        </div>
        <div style={styles.legend}>
          {programs.map(p => (
            <div key={p} style={styles.legendItem}>
              <span style={{ display: 'inline-block', width: 14, height: 2.5, background: colors[p], borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{p}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={isNarrow ? 220 : 260}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), 'dd/MM')}
            tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false}
            interval={isNarrow ? 'preserveStartEnd' : undefined} />
          <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
            tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<CustomTooltip />} />
          {programs.map(p => (
            <Line key={p} type="monotone" dataKey={p} stroke={colors[p]} strokeWidth={2.5}
              dot={{ r: 3.5, fill: colors[p] }} activeDot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '20px 22px',
    boxShadow: 'var(--shadow)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  cardTitle: { fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  cardSub: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  legend: { display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5 },
  empty: { textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '60px 0' },
  tooltip: { background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 14px',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
  tooltipDate: { color: 'var(--text2)', fontWeight: 600, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' },
}
