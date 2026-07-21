'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, Trip, Price, MileageBalance, TripType, TRIP_TYPE_LABELS, buildAirlineColors, formatMiles } from '@/lib/supabase'
import MilesForm  from '@/components/MilesForm'
import MilesChart from '@/components/MilesChart'
import MilesTable from '@/components/MilesTable'
import type { ToastType } from '@/components/FlightApp'

type Props = {
  trip: Trip
  balances: MileageBalance[]
  isLoggedIn: boolean
  isNarrow: boolean
  onToast: (message: string, type: ToastType) => void
}

const TRIP_TYPES: TripType[] = ['outbound', 'return', 'round_trip']

export default function MilesSection({ trip, balances, isLoggedIn, isNarrow, onToast }: Props) {
  const [data, setData]         = useState<Price[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<Price | null>(null)
  const [tripType, setTripType] = useState<TripType>('round_trip')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('prices')
      .select('*')
      .eq('trip_id', trip.id)
      .eq('payment_type', 'miles')
      .order('date', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [trip.id])

  useEffect(() => { fetchData() }, [fetchData])

  const programs = useMemo(() => Array.from(new Set(data.map(r => r.program))).sort(), [data])
  const colors   = useMemo(() => buildAirlineColors(programs), [programs])
  const airlines = useMemo(() => Array.from(new Set(data.map(r => r.airline))).sort(), [data])
  const airports = useMemo(() => Array.from(new Set(data.flatMap(r => [r.origin, r.destination]))), [data])

  // menor total de pontos (round_trip) por programa nesta viagem — para o saldo
  const cheapestByProgram = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of data) {
      if (r.trip_type !== 'round_trip') continue
      if (!(r.program in map) || r.miles_total < map[r.program]) map[r.program] = r.miles_total
    }
    return map
  }, [data])

  const usedTripTypes = TRIP_TYPES.filter(t => data.some(r => r.trip_type === t))

  return (
    <div>
      {/* saldos de pontos */}
      {balances.length > 0 && (
        <div style={styles.balanceRow}>
          {balances.map(b => {
            const need = cheapestByProgram[b.program]
            const enough = need !== undefined && b.balance >= need
            const missing = need !== undefined ? Math.max(0, need - b.balance) : null
            return (
              <div key={b.program} style={styles.balanceCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={styles.balanceName}>{b.program}</span>
                  <span style={styles.balanceVal}>{b.balance.toLocaleString('pt-BR')}</span>
                </div>
                {need !== undefined && (
                  <p style={{ fontSize: 11.5, marginTop: 4, color: enough ? 'var(--green)' : 'var(--text3)' }}>
                    {enough
                      ? `✓ suficiente p/ ida e volta (${formatMiles(need)})`
                      : `faltam ${missing!.toLocaleString('pt-BR')} pts p/ ida e volta`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* filtro de trecho */}
      <div style={styles.filterBar}>
        {(usedTripTypes.length > 1 || true) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={styles.filterLabel}>Visualizar:</span>
            <div className="segmented">
              {TRIP_TYPES.map(t => (
                <button key={t} className={tripType === t ? 'active' : ''} onClick={() => setTripType(t)}>
                  {TRIP_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        )}
        {loading && <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>carregando...</span>}
      </div>

      {/* form + gráfico */}
      <div style={isNarrow ? styles.topNarrow : (isLoggedIn ? styles.topBlock : styles.topReadonly)}>
        {isLoggedIn && (
          <MilesForm
            trip={trip}
            knownAirlines={airlines}
            knownAirports={airports}
            onSaved={msg => { fetchData(); onToast(msg ?? 'Resgate salvo!', 'success') }}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
          />
        )}
        <MilesChart data={data} tripType={tripType} colors={colors} isNarrow={isNarrow} />
      </div>

      <MilesTable
        data={data}
        colors={colors}
        isNarrow={isNarrow}
        canEdit={isLoggedIn}
        onRefresh={fetchData}
        onToast={onToast}
        onEdit={row => { setEditing(row); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  balanceRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 },
  balanceCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow)' },
  balanceName: { fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  balanceVal: { fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, color: 'var(--primary)' },
  filterBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  filterLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  topBlock: { display: 'grid', gridTemplateColumns: '460px minmax(0,1fr)', gap: 20, alignItems: 'stretch' },
  topReadonly: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 20 },
  topNarrow: { display: 'flex', flexDirection: 'column', gap: 20 },
}
