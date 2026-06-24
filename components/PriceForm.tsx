'use client'

import { useState, useEffect } from 'react'
import { supabase, FlightPrice, FlightPriceInsert } from '@/lib/supabase'

type Props = {
  onSaved: () => void
  editing: FlightPrice | null
  onCancelEdit: () => void
}

export default function PriceForm({ onSaved, editing, onCancelEdit }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [date, setDate]         = useState(today)
  const [airline, setAirline]   = useState<'Arajet' | 'Avianca'>('Arajet')
  const [priceOut, setPriceOut] = useState('')
  const [priceBack, setPriceBack] = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // populate form when editing
  useEffect(() => {
    if (editing) {
      setDate(editing.date)
      setAirline(editing.airline)
      setPriceOut(String(editing.price_out))
      setPriceBack(String(editing.price_back))
      setNotes(editing.notes ?? '')
    } else {
      setDate(today)
      setAirline('Arajet')
      setPriceOut('')
      setPriceBack('')
      setNotes('')
    }
  }, [editing])

  function parseBRL(raw: string): number {
    // accept "1.540,23" or "1540.23" or "1540,23"
    const clean = raw.trim().replace(/\./g, '').replace(',', '.')
    return parseFloat(clean)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const out  = parseBRL(priceOut)
    const back = parseBRL(priceBack)

    if (!date || isNaN(out) || isNaN(back)) {
      setError('Preencha data e valores válidos.')
      return
    }

    setLoading(true)

    const payload: FlightPriceInsert = {
      date,
      airline,
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
      setDate(today)
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
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
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
