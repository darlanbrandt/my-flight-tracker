'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { supabase, FlightPrice } from '@/lib/supabase'
import PriceForm  from '@/components/PriceForm'
import PriceChart from '@/components/PriceChart'
import PriceTable from '@/components/PriceTable'
import StatsBar   from '@/components/StatsBar'

export default function HomePage() {
  const [data, setData]       = useState<FlightPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FlightPrice | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('flight_prices')
      .select('*')
      .order('date', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={styles.page}>
      {/* header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.h1}>✈ Flight Prices</h1>
            <p style={styles.sub}>Arajet · Avianca — acompanhamento de tarifas</p>
          </div>
          {loading && <span style={styles.loading}>carregando...</span>}
        </div>
      </header>

      <main style={styles.main}>
        {/* form */}
        <PriceForm
          onSaved={fetchData}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
        />

        {/* stats */}
        <StatsBar data={data} />

        {/* chart */}
        <section>
          <SectionLabel>Variação de preço — total (ida + volta)</SectionLabel>
          <PriceChart data={data} />
        </section>

        {/* table */}
        <section>
          <SectionLabel>Todos os registros</SectionLabel>
          <PriceTable
            data={data}
            onRefresh={fetchData}
            onEdit={row => {
              setEditing(row)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </section>
      </main>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-3)',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 8,
    }}>
      {children}
    </p>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
  },
  header: {
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  h1: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  sub: {
    fontSize: 12,
    color: 'var(--text-3)',
    marginTop: 2,
  },
  loading: {
    fontSize: 11,
    color: 'var(--text-3)',
    fontFamily: 'JetBrains Mono, monospace',
  },
  main: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
}
