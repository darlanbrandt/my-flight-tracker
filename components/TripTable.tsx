'use client'

import { useState } from 'react'
import { supabase, Price, TripType, TRIP_TYPE_LABELS, PriceSource } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import type { ToastType } from '@/components/FlightApp'

type Props = {
  data: Price[]                       // já filtrado por viagem/rota
  colors: Record<string, string>
  isNarrow: boolean
  canEdit: boolean
  onRefresh: () => void
  onToast: (message: string, type: ToastType) => void
  onEdit: (row: Price) => void
}

const TRIP_TYPES: TripType[] = ['outbound', 'return', 'round_trip']

function formatBRL(v: number | null) {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getMins(data: Price[]) {
  const map: Record<string, number> = {}
  for (const row of data) {
    const key = `${row.airline}|${row.trip_type}`
    if (!(key in map) || row.total < map[key]) map[key] = row.total
  }
  return map
}

function AirlineBadge({ airline, color }: { airline: string; color: string }) {
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}>
      {airline}
    </span>
  )
}

export default function TripTable({ data, colors, isNarrow, canEdit, onRefresh, onToast, onEdit }: Props) {
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [airline, setAirline]       = useState<string>('all')
  const [tripFilter, setTripFilter] = useState<'all' | TripType>('all')
  const [sourceFilter, setSource]   = useState<'all' | PriceSource>('all')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc')

  const airlines = Array.from(new Set(data.map(r => r.airline))).sort()
  const usedTripTypes = TRIP_TYPES.filter(t => data.some(r => r.trip_type === t))
  const hasSources = new Set(data.map(r => r.source)).size > 1
  const mins = getMins(data)

  const filtered = data
    .filter(r => airline === 'all' || r.airline === airline)
    .filter(r => tripFilter === 'all' || r.trip_type === tripFilter)
    .filter(r => sourceFilter === 'all' || r.source === sourceFilter)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date)
      return sortDir === 'asc' ? cmp : -cmp
    })

  async function handleDelete(id: string) {
    if (!confirm('Deletar este registro?')) return
    setDeleting(id)
    const { error } = await supabase.from('prices').delete().eq('id', id)
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
          {airlines.length > 1 && (
            <div className="segmented">
              {['all', ...airlines].map(f => (
                <button key={f} className={airline === f ? 'active' : ''} onClick={() => setAirline(f)}>
                  {f === 'all' ? 'Todas' : f}
                </button>
              ))}
            </div>
          )}
          {usedTripTypes.length > 1 && (
            <div className="segmented">
              {(['all', ...usedTripTypes] as ('all' | TripType)[]).map(f => (
                <button key={f} className={tripFilter === f ? 'active' : ''} onClick={() => setTripFilter(f)}>
                  {f === 'all' ? 'Todos' : TRIP_TYPE_LABELS[f]}
                </button>
              ))}
            </div>
          )}
          {hasSources && (
            <div className="segmented">
              {(['all', 'manual', 'auto'] as const).map(f => (
                <button key={f} className={sourceFilter === f ? 'active' : ''} onClick={() => setSource(f)}>
                  {f === 'all' ? 'Todas as fontes' : f === 'manual' ? 'Manual' : 'Automático'}
                </button>
              ))}
            </div>
          )}
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
            const isBest = mins[`${row.airline}|${row.trip_type}`] === row.total
            return (
              <div key={row.id} style={styles.mobileCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AirlineBadge airline={row.airline} color={colors[row.airline]} />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text)' }}>
                      {format(parseISO(row.date), 'dd/MM/yyyy')}
                    </span>
                    {row.source === 'auto' && <span style={styles.autoBadge}>auto</span>}
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
                      <p style={mobileLabel}>Ida</p>
                      <p style={mobileValue}>{formatBRL(row.price_out)}</p>
                    </div>
                  )}
                  {row.price_back !== null && (
                    <div>
                      <p style={mobileLabel}>Volta</p>
                      <p style={mobileValue}>{formatBRL(row.price_back)}</p>
                    </div>
                  )}
                  <div>
                    <p style={mobileLabel}>Total</p>
                    <p style={{ ...mobileValue, fontWeight: 600, color: isBest ? 'var(--green)' : 'var(--text)' }}>
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
                {['DATA', 'CIA', 'ORIGEM', 'DESTINO', 'TRECHO', 'FONTE', 'IDA', 'VOLTA', 'TOTAL', ...(canEdit ? [''] : [])].map(h => (
                  <th key={h} style={{ ...styles.th, textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const isBest = mins[`${row.airline}|${row.trip_type}`] === row.total
                return (
                  <tr key={row.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>
                      {format(parseISO(row.date), 'dd/MM/yyyy')}
                    </td>
                    <td style={styles.td}>
                      <AirlineBadge airline={row.airline} color={colors[row.airline]} />
                    </td>
                    <td style={styles.td}><span className="chip">{row.origin}</span></td>
                    <td style={styles.td}><span className="chip">{row.destination}</span></td>
                    <td style={{ ...styles.td, fontSize: 12, color: 'var(--text3)' }}>
                      {TRIP_TYPE_LABELS[row.trip_type]}
                    </td>
                    <td style={{ ...styles.td, fontSize: 12, color: 'var(--text3)' }}>
                      {row.source === 'auto' ? <span style={styles.autoBadge}>auto</span> : 'manual'}
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

const mobileLabel: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
}

const mobileValue: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12.5,
  color: 'var(--text2)',
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
  autoBadge: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 5,
    background: 'var(--surface2)',
    border: '1px solid var(--border2)',
    color: 'var(--text3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
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
