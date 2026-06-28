'use client'

import { useState, useEffect } from 'react'
import {
  supabase, FlightPrice, FlightPriceInsert,
  Airline, Origin, Destination,
  ORIGINS, DESTINATIONS, DESTINATIONS_BY_AIRLINE,
} from '@/lib/supabase'

type Props = {
  onSaved: (msg?: string) => void
  editing: FlightPrice | null
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

function parseBRL(raw: string): number {
  const clean = raw.trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(clean)
}

function formatBRLInput(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PriceForm({ onSaved, editing, onCancelEdit }: Props) {
  const [date, setDate]           = useState(todayBR)
  const [airline, setAirline]     = useState<Airline>('Arajet')
  const [origin, setOrigin]       = useState<Origin>('GRU')
  const [destination, setDest]    = useState<Destination>('EWR')
  const [priceOut, setPriceOut]   = useState('')
  const [priceBack, setPriceBack] = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const availableDests = DESTINATIONS_BY_AIRLINE[airline]

  useEffect(() => {
    if (!availableDests.includes(destination)) {
      setDest(availableDests[0])
    }
  }, [airline])

  useEffect(() => {
    if (editing) {
      setDate(isoToBR(editing.date))
      setAirline(editing.airline)
      setOrigin(editing.origin)
      setDest(editing.destination)
      setPriceOut(formatBRLInput(editing.price_out))
      setPriceBack(formatBRLInput(editing.price_back))
      setNotes(editing.notes ?? '')
    } else {
      setDate(todayBR())
      setAirline('Arajet')
      setOrigin('GRU')
      setDest('EWR')
      setPriceOut('')
      setPriceBack('')
      setNotes('')
    }
  }, [editing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const out  = parseBRL(priceOut)
    const back = parseBRL(priceBack)

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || isNaN(out) || isNaN(back)) {
      setError('Preencha data (DD/MM/AAAA) e valores válidos.')
      return
    }

    setLoading(true)

    const payload: FlightPriceInsert = {
      date: brToISO(date),
      airline,
      origin,
      destination,
      price_out: out,
      price_back: back,
      notes: notes || undefined,
    }

    let err
    if (editing) {
      ;({ error: err } = await supabase
        .from('flight_prices')
        .update(payload)
        .eq('id', editing.id))
    } else {
      ;({ error: err } = await supabase.from('flight_prices').insert(payload))
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

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      {/* header */}
      <div style={styles.cardHeader}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 0 4px ${dotHalo}`,
          flexShrink: 0,
        }} />
        <span style={styles.cardTitle}>
          {isEdit ? 'Editar registro' : 'Novo registro'}
        </span>
      </div>

      {/* fields */}
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
          <select value={airline} onChange={e => setAirline(e.target.value as Airline)}>
            <option value="Arajet">Arajet</option>
            <option value="Avianca">Avianca</option>
            <option value="American">American Airlines</option>
          </select>
        </label>

        <label style={styles.label}>
          Origem
          <select value={origin} onChange={e => setOrigin(e.target.value as Origin)}>
            {(Object.keys(ORIGINS) as Origin[]).map(code => (
              <option key={code} value={code}>{code} — {ORIGINS[code].split(' - ')[0]}</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Destino
          <select value={destination} onChange={e => setDest(e.target.value as Destination)}>
            {availableDests.map(code => (
              <option key={code} value={code}>{code} — {DESTINATIONS[code]}</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Ida (R$)
          <input
            className="mono-input"
            type="text"
            placeholder="1.540,23"
            value={priceOut}
            onChange={e => setPriceOut(e.target.value)}
            required
          />
        </label>

        <label style={styles.label}>
          Volta (R$)
          <input
            className="mono-input"
            type="text"
            placeholder="1.879,85"
            value={priceBack}
            onChange={e => setPriceBack(e.target.value)}
            required
          />
        </label>

        <label style={{ ...styles.label, gridColumn: '1 / -1' }}>
          Observações (opcional)
          <input
            type="text"
            placeholder="ex: promoção, bagagem inclusa..."
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
