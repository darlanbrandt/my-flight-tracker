'use client'

import { useState } from 'react'
import { supabase, FlightPrice, Airline, AIRLINE_COLORS, ORIGINS, DESTINATIONS, RouteKey } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'

type AirlineFilter = 'all' | Airline

type Props = {
  data: FlightPrice[]
  routeFilter: RouteKey
  isNarrow: boolean
  canEdit: boolean
  onRefresh: () => void
  onEdit: (row: FlightPrice) => void
}

const AIRLINES: Airline[] = ['Arajet', 'Avianca', 'American']

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getMinByAirline(data: FlightPrice[]) {
  const map: Record<string, number> = {}
  for (const row of data) {
    if (!(row.airline in map) || row.total < map[row.airline]) {
      map[row.airline] = row.total
    }
  }
  return map
}

export default function PriceTable({ data, routeFilter, isNarrow, canEdit, onRefresh, onEdit }: Props) {
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [filter, setFilter]       = useState<AirlineFilter>('all')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  // apply route filter then airline filter then sort
  const routeFiltered = routeFilter === 'all'
    ? data
    : data.filter(r => `${r.origin}-${r.destination}` === routeFilter)

  const mins = getMinByAirline(routeFiltered)

  const filtered = routeFiltered
    .filter(r => filter === 'all' || r.airline === filter)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date)
      return sortDir === 'asc' ? cmp : -cmp
    })

  async function handleDelete(id: string) {
    if (!confirm('Deletar este registro?')) return
    setDeleting(id)
    await supabase.from('flight_prices').delete().eq('id', id)
    setDeleting(null)
    onRefresh()
  }

  return (
    <div style={styles.card}>
      {/* toolbar */}
      <div style={styles.toolbar}>
        <div className="segmented">
          {(['all', ...AIRLINES] as AirlineFilter[]).map(f => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Todas' : f}
            </button>
          ))}
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
        /* ── Mobile card list ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map(row => {
            const isBest = mins[row.airline] === row.total
            const color  = AIRLINE_COLORS[row.airline]
            return (
              <div key={row.id} style={styles.mobileCard}>
                {/* top row */}
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
                {/* route */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span className="chip" title={ORIGINS[row.origin]}>{row.origin}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>→</span>
                  <span className="chip" title={DESTINATIONS[row.destination]}>{row.destination}</span>
                </div>
                {/* prices */}
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Ida</p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text2)' }}>{formatBRL(row.price_out)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Volta</p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text2)' }}>{formatBRL(row.price_back)}</p>
                  </div>
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
        /* ── Desktop table ── */
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[...['DATA', 'CIA', 'ORIGEM', 'DESTINO', 'IDA', 'VOLTA', 'TOTAL'], ...(canEdit ? [''] : [])].map(h => (
                  <th key={h} style={{ ...styles.th, textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const isBest = mins[row.airline] === row.total
                return (
                  <tr key={row.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>
                      {format(parseISO(row.date), 'dd/MM/yyyy')}
                    </td>
                    <td style={styles.td}>
                      <span className={`badge badge-${row.airline.toLowerCase()}`}>{row.airline}</span>
                    </td>
                    <td style={styles.td}>
                      <span className="chip" title={ORIGINS[row.origin]}>{row.origin}</span>
                    </td>
                    <td style={styles.td}>
                      <span className="chip" title={DESTINATIONS[row.destination]}>{row.destination}</span>
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
