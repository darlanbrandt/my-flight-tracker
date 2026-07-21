'use client'

import { useState, useEffect } from 'react'
import {
  supabase, Trip, Price, PriceInsert, TripType,
  TRIP_TYPE_LABELS, AIRPORT_SUGGESTIONS, AIRLINE_SUGGESTIONS,
  PROGRAM_SUGGESTIONS, PROGRAM_BY_AIRLINE, normalizeAirline,
} from '@/lib/supabase'
import Autocomplete, { AutocompleteOption } from '@/components/Autocomplete'

type Props = {
  trip: Trip
  knownAirlines: string[]
  knownAirports: string[]
  onSaved: (msg?: string) => void
  editing: Price | null
  onCancelEdit: () => void
}

function isoToBR(iso: string) { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}` }
function brToISO(br: string) { const [d,m,y] = br.split('/'); return `${y}-${m}-${d}` }
function todayBR() { return isoToBR(new Date().toISOString().split('T')[0]) }

function parseInt2(raw: string): number | null {
  if (!raw.trim()) return null
  const v = parseInt(raw.replace(/\D/g, ''), 10)
  return isNaN(v) ? null : v
}
function parseBRL(raw: string): number | null {
  if (!raw.trim()) return null
  const v = parseFloat(raw.trim().replace(/\./g, '').replace(',', '.'))
  return isNaN(v) ? null : v
}
function fmtInt(v: number | null) { return v === null ? '' : v.toLocaleString('pt-BR') }
function fmtBRL(v: number | null) {
  return v === null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MilesForm({ trip, knownAirlines, knownAirports, onSaved, editing, onCancelEdit }: Props) {
  const [date, setDate]         = useState(todayBR)
  const [airline, setAirline]   = useState('Latam')
  const [program, setProgram]   = useState('Latam Pass')
  const [origin, setOrigin]     = useState('')
  const [destination, setDest]  = useState('')
  const [tripType, setTripType] = useState<TripType>('round_trip')
  const [milesOut, setMilesOut] = useState('')
  const [milesBack, setMilesBack] = useState('')
  const [taxOut, setTaxOut]     = useState('')
  const [taxBack, setTaxBack]   = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (editing) {
      setDate(isoToBR(editing.date))
      setAirline(editing.airline)
      setProgram(editing.program || '')
      setOrigin(editing.origin)
      setDest(editing.destination)
      setTripType(editing.trip_type)
      setMilesOut(fmtInt(editing.miles_out))
      setMilesBack(fmtInt(editing.miles_back))
      setTaxOut(fmtBRL(editing.price_out))
      setTaxBack(fmtBRL(editing.price_back))
      setNotes(editing.notes ?? '')
    } else {
      setDate(todayBR())
      setAirline('Latam'); setProgram('Latam Pass')
      setOrigin(knownAirports[0] ?? ''); setDest(knownAirports[1] ?? '')
      setTripType('round_trip')
      setMilesOut(''); setMilesBack(''); setTaxOut(''); setTaxBack(''); setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, trip.id])

  // ao trocar a companhia, sugere o programa correspondente (se não editando)
  useEffect(() => {
    if (editing) return
    const p = PROGRAM_BY_AIRLINE[airline.toLowerCase().trim()]
    if (p) setProgram(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airline])

  const showOut  = tripType === 'outbound' || tripType === 'round_trip'
  const showBack = tripType === 'return'   || tripType === 'round_trip'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) { setError('Data inválida. Use DD/MM/AAAA.'); return }
    if (!airline.trim()) { setError('Informe a companhia.'); return }
    if (!program.trim()) { setError('Informe o programa de milhas.'); return }
    if (!/^[A-Za-z]{3}$/.test(origin) || !/^[A-Za-z]{3}$/.test(destination)) {
      setError('Origem e destino devem ser códigos IATA (3 letras).'); return
    }

    const mOut = parseInt2(milesOut)
    const mBack = parseInt2(milesBack)
    if (showOut && mOut === null)  { setError('Informe os pontos da ida.');   return }
    if (showBack && mBack === null) { setError('Informe os pontos da volta.'); return }

    setLoading(true)
    const payload: PriceInsert = {
      trip_id: trip.id,
      date: brToISO(date),
      airline: normalizeAirline(airline),
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      trip_type: tripType,
      payment_type: 'miles',
      program: program.trim(),
      miles_out:  showOut  ? mOut  : null,
      miles_back: showBack ? mBack : null,
      price_out:  showOut  ? parseBRL(taxOut)  : null,   // complemento em R$
      price_back: showBack ? parseBRL(taxBack) : null,
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
      setMilesOut(''); setMilesBack(''); setTaxOut(''); setTaxBack(''); setNotes('')
      setDate(todayBR())
      onSaved('Resgate salvo!')
    } else {
      onCancelEdit(); onSaved('Resgate atualizado!')
    }
  }

  const isEdit = !!editing
  const airlineOptions: AutocompleteOption[] = Array.from(new Set([...knownAirlines, ...AIRLINE_SUGGESTIONS]))
    .sort((a, b) => a.localeCompare(b, 'pt-BR')).map(a => ({ value: a }))
  const programOptions: AutocompleteOption[] = PROGRAM_SUGGESTIONS.map(p => ({ value: p }))
  const airportOptions: AutocompleteOption[] = Array.from(new Set([...knownAirports, ...Object.keys(AIRPORT_SUGGESTIONS)]))
    .sort((a, b) => a.localeCompare(b)).map(code => ({ value: code, label: AIRPORT_SUGGESTIONS[code] }))

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={{ width: 8, height: 8, borderRadius: '50%',
          background: isEdit ? '#f5a623' : 'var(--primary)',
          boxShadow: `0 0 0 4px ${isEdit ? 'rgba(245,166,35,.18)' : 'rgba(232,67,58,.18)'}`, flexShrink: 0 }} />
        <span style={styles.cardTitle}>{isEdit ? 'Editar resgate' : 'Novo resgate em pontos'}</span>
      </div>

      <div style={styles.grid}>
        <label style={styles.label}>
          Data
          <input className="mono-input" type="text" placeholder="DD/MM/AAAA" value={date}
            onChange={e => setDate(e.target.value)} maxLength={10} required />
        </label>
        <label style={styles.label}>
          Companhia
          <Autocomplete value={airline} onChange={setAirline} options={airlineOptions}
            placeholder="ex: Latam" required />
        </label>
        <label style={styles.label}>
          Programa
          <Autocomplete value={program} onChange={setProgram} options={programOptions}
            placeholder="ex: Latam Pass" required />
        </label>
        <label style={styles.label}>
          Tipo de trecho
          <div style={styles.tripTypeRow}>
            {(['outbound', 'return', 'round_trip'] as TripType[]).map(t => (
              <button key={t} type="button" onClick={() => setTripType(t)}
                style={{ ...styles.tripBtn, ...(tripType === t ? styles.tripBtnActive : {}) }}>
                {TRIP_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </label>
        <label style={styles.label}>
          Origem
          <Autocomplete value={origin} onChange={setOrigin} options={airportOptions}
            placeholder="GRU" mono uppercase maxLength={3} required />
        </label>
        <label style={styles.label}>
          Destino
          <Autocomplete value={destination} onChange={setDest} options={airportOptions}
            placeholder="LIS" mono uppercase maxLength={3} required />
        </label>

        {showOut && (
          <>
            <label style={styles.label}>
              Pontos ida
              <input className="mono-input" type="text" placeholder="70.000" value={milesOut}
                onChange={e => setMilesOut(e.target.value)} />
            </label>
            <label style={styles.label}>
              Taxa ida (R$)
              <input className="mono-input" type="text" placeholder="180,00" value={taxOut}
                onChange={e => setTaxOut(e.target.value)} />
            </label>
          </>
        )}
        {showBack && (
          <>
            <label style={styles.label}>
              Pontos volta
              <input className="mono-input" type="text" placeholder="70.000" value={milesBack}
                onChange={e => setMilesBack(e.target.value)} />
            </label>
            <label style={styles.label}>
              Taxa volta (R$)
              <input className="mono-input" type="text" placeholder="180,00" value={taxBack}
                onChange={e => setTaxBack(e.target.value)} />
            </label>
          </>
        )}

        <label style={{ ...styles.label, gridColumn: '1 / -1' }}>
          Observações (opcional)
          <input type="text" placeholder="ex: promoção de pontos, clube..." value={notes}
            onChange={e => setNotes(e.target.value)} />
        </label>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.actions}>
        {isEdit && <button type="button" className="btn-ghost" onClick={onCancelEdit}>Cancelar</button>}
        <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '10px 22px' }}>
          {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Adicionar resgate'}
        </button>
      </div>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 22,
    boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10 },
  cardTitle: { fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text2)', minWidth: 0 },
  tripTypeRow: { display: 'flex', gap: 6, marginTop: 2 },
  tripBtn: { flex: 1, padding: '8px 6px', fontSize: 12, fontWeight: 600, background: 'var(--surface2)',
    border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' },
  tripBtnActive: { background: 'var(--primary)', color: '#fff', border: '1px solid transparent' },
  actions: { display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 'auto' },
  error: { color: 'var(--red)', fontSize: 12.5 },
}
