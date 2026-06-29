'use client'

import { useState, useEffect } from 'react'
import {
  supabase, DomesticPrice, DomesticPriceInsert,
  DomesticAirline, TripType, TRIP_TYPE_LABELS, DOMESTIC_AIRPORTS,
} from '@/lib/supabase'

type Props = {
  onSaved: (msg?: string) => void
  editing: DomesticPrice | null
  onCancelEdit: () => void
}

function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function brToISO(br: string): string {
  const [d, m, y] = br.split('/')
  return `${y}-${m}-${d}`
}

function todayBR(): string {
  return isoToBR(new Date().toISOString().split('T')[0])
}

function parseBRL(raw: string): number | null {
  if (!raw.trim()) return null
  const clean = raw.trim().replace(/\./g, '').replace(',', '.')
  const v = parseFloat(clean)
  return isNaN(v) ? null : v
}

function formatBRLInput(v: number | null): string {
  if (v === null) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const AIRPORTS = Object.keys(DOMESTIC_AIRPORTS) as string[]

export default function DomesticForm({ onSaved, editing, onCancelEdit }: Props) {
  const [date, setDate]           = useState(todayBR)
  const [airline, setAirline]     = useState<DomesticAirline>('Gol')
  const [origin, setOrigin]       = useState('GRU')
  const [destination, setDest]    = useState('SDU')
  const [tripType, setTripType]   = useState<TripType>('round_trip')
  const [priceOut, setPriceOut]   = useState('')
  const [priceBack, setPriceBack] = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (editing) {
      setDate(isoToBR(editing.date))
      setAirline(editing.airline)
      setOrigin(editing.origin)
      setDest(editing.destination)
      setTripType(editing.trip_type)
      setPriceOut(formatBRLInput(editing.price_out))
      setPriceBack(formatBRLInput(editing.price_back))
      setNotes(editing.notes ?? '')
    } else {
      setDate(todayBR())
      setAirline('Gol')
      setOrigin('GRU')
      setDest('SDU')
      setTripType('round_trip')
      setPriceOut('')
      setPriceBack('')
      setNotes('')
    }
  }, [editing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      setError('Data inválida. Use DD/MM/AAAA.')
      return
    }

    const out  = parseBRL(priceOut)
    const back = parseBRL(priceBack)

    if (tripType === 'outbound' && out === null) {
      setError('Informe o valor da ida.')
      return
    }
    if (tripType === 'return' && back === null) {
      setError('Informe o valor da volta.')
      return
    }
    if (tripType === 'round_trip' && (out === null || back === null)) {
      setError('Informe os valores de ida e volta.')
      return
    }

    setLoading(true)

    const payload: DomesticPriceInsert = {
      date: brToISO(date),
      airline,
      origin,
      destination,
      trip_type: tripType,
      price_out:  tripType !== 'return'   ? out  : null,
      price_back: tripType !== 'outbound' ? back : null,
      notes: notes || undefined,
    }

    let err
    if (editing) {
      ;({ error: err } = await supabase
        .from('domestic_prices')
        .update(payload)
        .eq('id', editing.id))
    } else {
      ;({ error: err } = await supabase.from('domestic_prices').insert(payload))
    }

    setLoading(false)
    if (err) { setError(err.message); return }

    if (!editing) {
      setPriceOut('')
      setPriceBack('')
      setNotes('')
      setDate(todayBR())
      onSaved('Registro salvo com sucesso!')
    } else {
      onCancelEdit()
      onSaved('Registro atualizado!')
    }
  }

  const isEdit = !!editing
  const dotColor = isEdit ? '#f5a623' : 'var(--primary)'
  const dotHalo  = isEdit ? 'rgba(245,166,35,.18)' : 'rgba(232,67,58,.18)'

  const showOut  = tripType === 'outbound'   || tripType === 'round_trip'
  const showBack = tripType === 'return'     || tripType === 'round_trip'

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 0 4px ${dotHalo}`,
          flexShrink: 0,
        }} />
        <span style={styles.cardTitle}>
          {isEdit ? 'Editar registro' : 'Novo registro doméstico'}
        </span>
      </div>

      <div style={styles.grid}>
        <label style={styles.label}>
          Data
          <input
            className="mono-input"
            type="text"
            placeholder="DD/MM/AAAA"
            value={date}
            onChange={e => setDate(e.target.value)}
            maxLength={10}
            required
          />
        </label>

        <label style={styles.label}>
          Companhia
          <select value={airline} onChange={e => setAirline(e.target.value as DomesticAirline)}>
            <option value="Gol">Gol</option>
            <option value="Latam">LATAM</option>
          </select>
        </label>

        <label style={styles.label}>
          Origem
          <select value={origin} onChange={e => setOrigin(e.target.value)}>
            {AIRPORTS.map(code => (
              <option key={code} value={code}>{code} — {DOMESTIC_AIRPORTS[code]}</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Destino
          <select value={destination} onChange={e => setDest(e.target.value)}>
            {AIRPORTS.map(code => (
              <option key={code} value={code}>{code} — {DOMESTIC_AIRPORTS[code]}</option>
            ))}
          </select>
        </label>

        <label style={{ ...styles.label, gridColumn: '1 / -1' }}>
          Tipo de trecho
          <div style={styles.tripTypeRow}>
            {(['outbound', 'return', 'round_trip'] as TripType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTripType(t)}
                style={{
                  ...styles.tripBtn,
                  ...(tripType === t ? styles.tripBtnActive : {}),
                }}
              >
                {TRIP_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </label>

        {showOut && (
          <label style={styles.label}>
            Ida (R$)
            <input
              className="mono-input"
              type="text"
              placeholder="540,00"
              value={priceOut}
              onChange={e => setPriceOut(e.target.value)}
            />
          </label>
        )}

        {showBack && (
          <label style={styles.label}>
            Volta (R$)
            <input
              className="mono-input"
              type="text"
              placeholder="620,00"
              value={priceBack}
              onChange={e => setPriceBack(e.target.value)}
            />
          </label>
        )}

        <label style={{ ...styles.label, gridColumn: '1 / -1' }}>
          Observações (opcional)
          <input
            type="text"
            placeholder="ex: promoção, assento extra..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.actions}>
        {isEdit && (
          <button type="button" className="btn-ghost" onClick={onCancelEdit}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={loading}
          style={{ padding: '10px 22px' }}>
          {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Adicionar registro'}
        </button>
      </div>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: 22,
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text2)',
    minWidth: 0,
  },
  tripTypeRow: {
    display: 'flex',
    gap: 6,
    marginTop: 2,
  },
  tripBtn: {
    flex: 1,
    padding: '8px 6px',
    fontSize: 12,
    fontWeight: 600,
    background: 'var(--surface2)',
    border: '1px solid var(--border2)',
    borderRadius: 9,
    color: 'var(--text2)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tripBtnActive: {
    background: 'var(--primary)',
    color: '#fff',
    border: '1px solid transparent',
  },
  actions: {
    display: 'flex',
    gap: 9,
    justifyContent: 'flex-end',
    marginTop: 'auto',
  },
  error: {
    color: 'var(--red)',
    fontSize: 12.5,
  },
}
