'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, Trip, Price, TripType, TRIP_TYPE_LABELS, buildAirlineColors } from '@/lib/supabase'
import EntryForm    from '@/components/EntryForm'
import TripBanner    from '@/components/TripBanner'
import TripChart    from '@/components/TripChart'
import TripStatsBar from '@/components/TripStatsBar'
import TripTable    from '@/components/TripTable'
import type { ToastType } from '@/components/FlightApp'

type Props = {
  trip: Trip
  isLoggedIn: boolean
  isNarrow: boolean
  onToast: (message: string, type: ToastType) => void
}

const TRIP_TYPES: TripType[] = ['outbound', 'return', 'round_trip']

export default function TripSection({ trip, isLoggedIn, isNarrow, onToast }: Props) {
  const [data, setData]         = useState<Price[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<Price | null>(null)
  const [tripType, setTripType] = useState<TripType>('round_trip')
  const [route, setRoute]       = useState<string>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('prices')
      .select('*')
      .eq('trip_id', trip.id)
      .eq('payment_type', 'cash')
      .order('date', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [trip.id])

  useEffect(() => { fetchData() }, [fetchData])

  const routes = useMemo(
    () => Array.from(new Set(data.map(r => `${r.origin}-${r.destination}`))).sort(),
    [data],
  )

  const routeData = useMemo(
    () => route === 'all' ? data : data.filter(r => `${r.origin}-${r.destination}` === route),
    [data, route],
  )

  const airlines = useMemo(
    () => Array.from(new Set(data.map(r => r.airline))).sort(),
    [data],
  )
  const colors = useMemo(() => buildAirlineColors(airlines), [airlines])

  const airports = useMemo(
    () => Array.from(new Set(data.flatMap(r => [r.origin, r.destination]))),
    [data],
  )

  const usedTripTypes = TRIP_TYPES.filter(t => data.some(r => r.trip_type === t))
  const showTripTypeSelector = usedTripTypes.length > 1 || trip.kind === 'domestica'

  // gráfico e cards priorizam registros manuais; se a viagem só tem
  // automáticos (ex: acompanhamento novo), usam os automáticos como base
  const sourceMode: 'manual' | 'auto' = data.some(r => r.source === 'manual') ? 'manual' : 'auto'

  return (
    <div>
      <TripBanner data={routeData} sourceMode={sourceMode} colors={colors} />

      {/* filtros */}
      <div style={styles.filterBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
          {showTripTypeSelector && (
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
          {routes.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={styles.filterLabel}>Rota:</span>
              <select value={route} onChange={e => setRoute(e.target.value)} style={{ minWidth: 140 }}>
                <option value="all">Todas as rotas</option>
                {routes.map(r => (
                  <option key={r} value={r}>{r.replace('-', ' → ')}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
            carregando...
          </span>
        )}
      </div>

      {/* form + gráfico */}
      <div style={isNarrow ? styles.topNarrow : (isLoggedIn ? styles.topBlock : styles.topReadonly)}>
        {isLoggedIn && (
          <EntryForm
            trip={trip}
            knownAirlines={airlines}
            knownAirports={airports}
            onSaved={msg => { fetchData(); onToast(msg ?? 'Registro salvo!', 'success') }}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
          />
        )}
        <TripChart data={routeData} tripType={tripType} colors={colors} sourceMode={sourceMode} isNarrow={isNarrow} />
      </div>

      <TripStatsBar data={routeData} tripType={tripType} colors={colors} sourceMode={sourceMode} isNarrow={isNarrow} />

      <TripTable
        data={routeData}
        colors={colors}
        isNarrow={isNarrow}
        canEdit={isLoggedIn}
        onRefresh={fetchData}
        onToast={onToast}
        onEdit={row => {
          setEditing(row)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  topBlock: {
    display: 'grid',
    gridTemplateColumns: '460px minmax(0,1fr)',
    gap: 20,
    alignItems: 'stretch',
  },
  topReadonly: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr)',
    gap: 20,
  },
  topNarrow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
}
