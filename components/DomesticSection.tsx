'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, DomesticPrice, TripType } from '@/lib/supabase'
import DomesticForm     from '@/components/DomesticForm'
import DomesticChart    from '@/components/DomesticChart'
import DomesticStatsBar from '@/components/DomesticStatsBar'
import DomesticTable    from '@/components/DomesticTable'
import type { ToastType } from '@/components/FlightApp'

type Props = {
  isLoggedIn: boolean
  isNarrow: boolean
  onToast: (message: string, type: ToastType) => void
}

export default function DomesticSection({ isLoggedIn, isNarrow, onToast }: Props) {
  const [data, setData]       = useState<DomesticPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<DomesticPrice | null>(null)
  const [tripType, setTripType] = useState<TripType>('round_trip')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('domestic_prices')
      .select('*')
      .order('date', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      {/* trip type selector for chart */}
      <div style={styles.tripBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.tripLabel}>Visualizar:</span>
          <div className="segmented">
            {(['outbound', 'return', 'round_trip'] as TripType[]).map(t => {
              const label = t === 'outbound' ? 'Só ida' : t === 'return' ? 'Só volta' : 'Ida e volta'
              return (
                <button key={t} className={tripType === t ? 'active' : ''} onClick={() => setTripType(t)}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
            carregando...
          </span>
        )}
      </div>

      {/* form + chart */}
      <div style={isNarrow ? styles.topNarrow : (isLoggedIn ? styles.topBlock : styles.topReadonly)}>
        {isLoggedIn && (
          <DomesticForm
            onSaved={msg => { fetchData(); onToast(msg ?? 'Registro salvo!', 'success') }}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
          />
        )}
        <DomesticChart data={data} tripType={tripType} isNarrow={isNarrow} />
      </div>

      <DomesticStatsBar data={data} isNarrow={isNarrow} />

      <DomesticTable
        data={data}
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
  tripBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  tripLabel: {
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
