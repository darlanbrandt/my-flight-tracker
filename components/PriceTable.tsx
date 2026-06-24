'use client'

import { useState } from 'react'
import { supabase, FlightPrice } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Props = {
  data: FlightPrice[]
  onRefresh: () => void
  onEdit: (row: FlightPrice) => void
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// find min total per airline for highlighting best price
function getMinByAirline(data: FlightPrice[]) {
  const map: Record<string, number> = {}
  for (const row of data) {
    if (!(row.airline in map) || row.total < map[row.airline]) {
      map[row.airline] = row.total
    }
  }
  return map
}

export default function PriceTable({ data, onRefresh, onEdit }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter]     = useState<'all' | 'Arajet' | 'Avianca'>('all')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')

  const mins = getMinByAirline(data)

  const filtered = data
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

  if (data.length === 0) {
    return (
      <div style={styles.empty}>
        Nenhum registro ainda.
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      {/* toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          {(['all', 'Arajet', 'Avianca'] as const).map(f => (
            <button
              key={f}
              className={filter === f ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Todas' : f}
            </button>
          ))}
        </div>
        <button
          className="btn-ghost"
          style={{ padding: '5px 12px', fontSize: 12 }}
          onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
        >
          Data {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Data', 'Companhia', 'Ida', 'Volta', 'Total', ''].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const isBest = mins[row.airline] === row.total
              return (
                <tr key={row.id} style={styles.tr}>
                  <td style={{ ...styles.td, ...styles.mono }}>
                    {format(parseISO(row.date), 'dd/MM/yyyy')}
                  </td>
                  <td style={styles.td}>
                    <span className={`badge badge-${row.airline.toLowerCase()}`}>
                      {row.airline}
                    </span>
                  </td>
                  <td style={{ ...styles.td, ...styles.mono, color: 'var(--text-2)' }}>
                    {formatBRL(row.price_out)}
                  </td>
                  <td style={{ ...styles.td, ...styles.mono, color: 'var(--text-2)' }}>
                    {formatBRL(row.price_back)}
                  </td>
                  <td style={{ ...styles.td, ...styles.mono, fontWeight: 600,
                    color: isBest ? 'var(--green)' : 'var(--text)' }}>
                    {formatBRL(row.total)}
                    {isBest && (
                      <span style={{ marginLeft: 6, fontSize: 10,
                        color: 'var(--green)', fontWeight: 400 }}>
                        ★ min
                      </span>
                    )}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <button
                      className="btn-edit"
                      onClick={() => onEdit(row)}
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(row.id)}
                      disabled={deleting === row.id}
                      title="Deletar"
                    >
                      {deleting === row.id ? '...' : '🗑'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={styles.count}>{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    gap: 8,
  },
  filterGroup: {
    display: 'flex',
    gap: 6,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '10px 14px',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  mono: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: 'var(--text-3)',
    fontSize: 13,
  },
  count: {
    padding: '10px 16px',
    fontSize: 11,
    color: 'var(--text-3)',
    borderTop: '1px solid var(--border)',
    textAlign: 'right',
  },
}
