'use client'

import { useState, useEffect } from 'react'
import {
  supabase, FlightPrice, FlightPriceInsert,
  Origin, Destination, ORIGINS, DESTINATIONS, DESTINATIONS_BY_AIRLINE,
} from '@/lib/supabase'

type Props = {
  onSaved: () => void
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
  // accept "1.540,23" or "1540.23" or "1540,23"
  const clean = raw.trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(clean)
}

function formatBRLInput(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PriceForm({ onSaved, editing, onCancelEdit }: Props) {
  const [date, setDate]           = useState(todayBR)
  const [airline, setAirline]     = useState<'Arajet' | 'Avianca'>('Arajet')
  const [origin, setOrigin]       = useState<Origin>('GRU')
  const [destination, setDest]    = useState<Destination>('EWR')
  const [priceOut, setPriceOut]   = useState('')
  const [priceBack, setPriceBack] = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const availableDests = DESTINATIONS_BY_AIRLINE[airline]

  // if current destination not valid for airline, reset to first available
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
    const dateISO = brToISO(date)

    if (!date || !/^\d{2}\/\d{2}\/\d{4}$/.test(date) || isNaN(out) || isNaN(back)) {
      setError('Preencha data (DD/MM/AAAA) e valores válidos.')
      return
    }

    setLoading(true)

    const payload: FlightPriceInsert = {
      date: dateISO,
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

    if (err) {
      setError(err.message)
      return
    }

    if (!editing) {
      setPriceOut('')
      setPriceBack('')
      setNotes('')
      setDate(todayBR())
    } else {
      onCancelEdit()
    }
    onSaved()
  }

  const isEdit = !!editing

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.title}>
        {isEdit ? '✏️ Editar registro' : '+ Novo registro'}
      </div>

      <div style={styles.grid}>
        <label style={styles.label}>
          Data
          <input
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
          <select value={airline} onChange={e => setAirline(e.target.value as any)}>
            <option value="Arajet">Arajet</option>
            <option value="Avianca">Avianca</option>
          </select>
        </label>

        <label style={styles.label}>
          Origem
          <select value={origin} onChange={e => setOrigin(e.target.value as Origin)}>
            {(Object.keys(ORIGINS) as Origin[]).map(code => (
              <option key={code} value={code}>{code} — {ORIGINS[code]}</option>
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
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Adicionar'}
        </button>
      </div>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-2)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 12,
    color: 'var(--text-2)',
    fontWeight: 500,
  },
  actions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  error: {
    color: 'var(--red)',
    fontSize: 12,
  },
}
