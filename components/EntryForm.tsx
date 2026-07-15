'use client'

import { useState, useEffect } from 'react'
import {
  supabase, Trip, Price, PriceInsert, TripType,
  TRIP_TYPE_LABELS, AIRPORT_SUGGESTIONS, AIRLINE_SUGGESTIONS,
} from '@/lib/supabase'

type Props = {
  trip: Trip
  knownAirlines: string[]     // companhias já registradas na viagem (sugestões)
  knownAirports: string[]     // aeroportos já registrados na viagem
  onSaved: (msg?: string) => void
  editing: Price | null
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

export default function EntryForm({ trip, knownAirlines, knownAirports, onSaved, editing, onCancelEdit }: Props) {
  const [date, setDate]           = useState(todayBR)
  const [airline, setAirline]     = useState('')
  const [origin, setOrigin]       = useState('')
  const [destination, setDest]    = useState('')
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
      setAirline(knownAirlines[0] ?? '')
      setOrigin(knownAirports[0] ?? '')
      setDest(knownAirports[1] ?? '')
      setTripType('round_trip')
      setPriceOut('')
      setPriceBack('')
      setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, trip.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      setError('Data inválida. Use DD/MM/AAAA.')
      return
    }
    if (!airline.trim()) {
      setError('Informe a companhia aérea.')
      return
    }
    if (!/^[A-Za-z]{3}$/.test(origin) || !/^[A-Za-z]{3}$/.test(destination)) {
      setError('Origem e destino devem ser códigos IATA de 3 letras (ex: FLN).')
      return
    }

    const out  = parseBRL(priceOut)
    const back = parseBRL(priceBack)

    if (tripType === 'outbound' && out === null)  { setError('Informe o valor da ida.');   return }
    if (tripType === 'return'   && back === null) { setError('Informe o valor da volta.'); return }
    if (tripType === 'round_trip' && (out === null || back === null)) {
      setError('Informe os valores de ida e volta.')
      return
    }

    setLoading(true)

    const payload: PriceInsert = {
      trip_id: trip.id,
      date: brToISO(date),
      airline: airline.trim(),
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      trip_type: tripType,
      price_out:  tripType !== 'return'   ? out  : null,
      price_back: tripType !== 'outbound' ? back : null,
      source: 'manual',
      notes: notes || undefined,
    }

    let err
    if (editing) {
      ;({ error: err } = await supabase.from('prices').update(payload).eq('id', editing.id))
    } else {
      ;({ error: err } = await supabase.from('prices').insert(payload))
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

  const showOut  = tripType === 'outbound' || tripType === 'round_trip'
  const showBack = tripType === 'return'   || tripType === 'round_trip'

  const airportOptions = Array.from(new Set([
    ...knownAirports,
    ...Object.keys(AIRPORT_SUGGESTIONS),
  ]))

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
          {isEdit ? 'Editar registro' : 'Novo registro'}
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
          <input
            type="text"
            list="airline-suggestions"
            placeholder="ex: Gol, LATAM, Copa..."
            value={airline}
            onChange={e => setAirline(e.target.value)}
            required
          />
          <datalist id="airline-suggestions">
            {Array.from(new Set([...knownAirlines, ...AIRLINE_SUGGESTIONS])).map(a => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>

        <label style={styles.label}>
          Origem
          <input
            className="mono-input"
            type="text"
            list="airport-suggestions"
            placeholder="FLN"
            value={origin}
            onChange={e => setOrigin(e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </label>

        <label style={styles.label}>
          Destino
          <input
            className="mono-input"
            type="text"
            list="airport-suggestions"
            placeholder="GRU"
            value={destination}
            onChange={e => setDest(e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
          <datalist id="airport-suggestions">
            {airportOptions.map(code => (
              <option key={code} value={code}>
                {AIRPORT_SUGGESTIONS[code] ?? ''}
              </option>
            ))}
          </datalist>
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
