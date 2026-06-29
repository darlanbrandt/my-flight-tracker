'use client'

import { useState } from 'react'
import { supabase, DomesticPrice, DomesticAirline, DOMESTIC_AIRLINE_COLORS, TripType, TRIP_TYPE_LABELS } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import type { ToastType } from '@/components/FlightApp'

type AirlineFilter = 'all' | DomesticAirline
type TripFilter = 'all' | TripType

type Props = {
  data: DomesticPrice[]
  isNarrow: boolean
  canEdit: boolean
  onRefresh: () => void
  onToast: (message: string, type: ToastType) => void
  onEdit: (row: DomesticPrice) => void
}

const AIRLINES: DomesticAirline[] = ['Gol', 'Latam']
const TRIP_TYPES: TripType[] = ['outbound', 'return', 'round_trip']

function formatBRL(v: number | null) {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getMinByAirlineAndTrip(data: DomesticPrice[]) {
  const map: Record<string, number> = {}
  for (const row of data) {
    const key = `${row.airline}|${row.trip_type}`
    if (!(key in map) || row.total < map[key]) {
      map[key] = row.total
    }
  }
  return map
}

export default function DomesticTable({ data, isNarrow, canEdit, onRefresh, onToast, onEdit }: Props) {
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [airline, setAirline]     = useState<AirlineFilter>('all')
  const [tripFilter, setTripFilter] = useState<TripFilter>('all')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  const mins = getMinByAirlineAndTrip(data)

  const filtered = data
    .filter(r => airline === 'all' || r.airline === airline)
    .filter(r => tripFilter === 'all' || r.trip_type === tripFilter)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date)
      return sortDir === 'asc' ? cmp : -cmp
    })

  async function handleDelete(id: string) {
    if (!confirm('Deletar este registro?')) return
    setDeleting(id)
    const { error } = await supabase.from('domestic_prices').delete().eq('id', id)
    setDeleting(null)
    if (error) {
      onToast('Erro ao deletar registro.', 'error')
    } else {
      onToast('Registro deletado.', 'success')
      onRefresh()
    }
  }

  return (
    <div style={styles.card}>
      {/* toolbar */}
      <div style={styles.toolbar}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <div className="segmented">
            {(['all', ...AIRLINES] as AirlineFilter[]).map(f => (
              <button key={f} className={airline === f ? 'active' : ''} onClick={() => setAirline(f)}>
                {f === 'all' ? 'Todas' : f}
              </button>
            ))}
          </div>
          <div className="segmented">
            {(['all', ...TRIP_TYPES] as TripFilter[]).map(f => (
              <button key={f} className={tripFilter === f ? 'active' : ''} onClick={() => setTripFilter(f)}>
                {f === 'all' ? 'Todos' : TRIP_TYPE_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.toolbarRight}>
          <span style={styles.count}>
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </span>
          <button
            className="btn-ghost"
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          >
            Data {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={styles.empty}>Nenhum registro ainda.</p>
      ) : isNarrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map(row => {
            const minKey = `${row.airline}|${row.trip_type}`
            const isBest = mins[minKey] === row.total
            const color  = DOMESTIC_AIRLINE_COLORS[row.airline]
            return (
              <div key={row.id} style={styles.mobileCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge badge-${row.airline.toLowerCase()}`}>{row.airline}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text)' }}>
                      {format(parseISO(row.date), 'dd/MM/yyyy')}
                    </span>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-edit" onClick={() => onEdit(row)} title="Editar" style={{ width: 30, height: 30, padding: 0 }}>✏️</button>
                      <button className="btn-danger" onClick={() => handleDelete(row.id)} disabled={deleting === row.id} title="Deletar" style={{ width: 30, height: 30, padding: 0 }}>
                        {deleting === row.id ? '…' : '🗑'}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span className="chip">{row.origin}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>→</span>
                  <span className="chip">{row.destination}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
                    {TRIP_TYPE_LABELS[row.trip_type]}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' as const }}>
                  {row.price_out !== null && (
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Ida</p>
                      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text2)' }}>{formatBRL(row.price_out)}</p>
                    </div>
                  )}
                  {row.price_back !== null && (
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Volta</p>
                      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text2)' }}>{formatBRL(row.price_back)}</p>
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total</p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 600, color: isBest ? 'var(--green)' : 'var(--text)' }}>
                      {formatBRL(row.total)}{isBest && ' ★'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['DATA', 'CIA', 'ORIGEM', 'DESTINO', 'TRECHO', 'IDA', 'VOLTA', 'TOTAL', ...(canEdit ? [''] : [])].map(h => (
                  <th key={h} style={{ ...styles.th, textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const minKey = `${row.airline}|${row.trip_type}`
                const isBest = mins[minKey] === row.total
                return (
                  <tr key={row.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>
                      {format(parseISO(row.date), 'dd/MM/yyyy')}
                    </td>
                    <td style={styles.td}>
                      <span className={`badge badge-${row.airline.toLowerCase()}`}>{row.airline}</span>
                    </td>
                    <td style={styles.td}><span className="chip">{row.origin}</span></td>
                    <td style={styles.td}><span className="chip">{row.destination}</span></td>
                    <td style={{ ...styles.td, fontSize: 12, color: 'var(--text3)' }}>
                      {TRIP_TYPE_LABELS[row.trip_type]}
                    </td>
                    <td style={{ ...styles.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text2)' }}>
                      {formatBRL(row.price_out)}
                    </td>
                    <td style={{ ...styles.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text2)' }}>
                      {formatBRL(row.price_back)}
                    </td>
                    <td style={{ ...styles.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 600, color: isBest ? 'var(--green)' : 'var(--text)' }}>
                      {formatBRL(row.total)}
                      {isBest && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400 }}>★ min</span>}
                    </td>
                    {canEdit && (
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn-edit" onClick={() => onEdit(row)} title="Editar"
                          style={{ width: 30, height: 30, padding: 0, marginRight: 4 }}>✏️</button>
                        <button className="btn-danger" onClick={() => handleDelete(row.id)}
                          disabled={deleting === row.id} title="Deletar"
                          style={{ width: 30, height: 30, padding: 0 }}>
                          {deleting === row.id ? '…' : '🗑'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 18,
    boxShadow: 'var(--shadow)',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderBottom: '1px solid var(--border)',
    gap: 10,
    flexWrap: 'wrap',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  count: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    color: 'var(--text3)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '11px 16px',
    fontSize: 10.5,
    fontWeight: 700,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '12px 16px',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: 'var(--text3)',
    fontSize: 13,
  },
  mobileCard: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
  },
}
