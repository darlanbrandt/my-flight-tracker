'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, FlightPrice, Origin, Destination, RouteKey } from '@/lib/supabase'
import PriceForm  from '@/components/PriceForm'
import PriceChart from '@/components/PriceChart'
import PriceTable from '@/components/PriceTable'
import StatsBar   from '@/components/StatsBar'
import LoginForm  from '@/components/LoginForm'

export default function FlightApp() {
  const [user, setUser]           = useState<User | null | undefined>(undefined)
  const [showLogin, setShowLogin] = useState(false)
  const [data, setData]           = useState<FlightPrice[]>([])
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState<FlightPrice | null>(null)
  const [theme, setTheme]         = useState<'dark' | 'light'>('light')
  const [routeFilter, setRoute]   = useState<RouteKey>('all')
  const [isNarrow, setIsNarrow]   = useState(false)
  const containerRef              = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setShowLogin(false)
    })
    return () => subscription.unsubscribe()
  }, [])

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const check = () => {
      const w = containerRef.current?.offsetWidth ?? window.innerWidth
      setIsNarrow(w < 880)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isLoggedIn = !!user

  const routes = Array.from(
    new Set(data.map(r => `${r.origin}-${r.destination}`))
  ).sort()

  const filteredData = routeFilter === 'all'
    ? data
    : data.filter(r => `${r.origin}-${r.destination}` === routeFilter)

  const routeLabel = routeFilter === 'all'
    ? 'todas as rotas'
    : (() => {
        const [o, d] = routeFilter.split('-') as [Origin, Destination]
        return `${o} → ${d}`
      })()

  if (showLogin && !isLoggedIn) {
    return <LoginForm onCancel={() => setShowLogin(false)} />
  }

  return (
    <div ref={containerRef} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={styles.container}>

        {/* ── Header ── */}
        <header style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logoBox}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4 1-4 1L8.8 8.2l-5.8-1a1 1 0 0 0-.9 1.7l3.6 3.6-.9 4.4a.5.5 0 0 0 .7.6l3.5-1.5 3.6 3.6a1 1 0 0 0 1.7-.9z"/>
              </svg>
            </div>
            <div>
              <h1 style={styles.h1}>Flight Price Tracker</h1>
              <p style={styles.sub}>
                Arajet · Avianca · American — Brasil → EUA · acompanhamento diário de tarifas
              </p>
            </div>
          </div>

          <div style={styles.controls}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                Rota
              </p>
              <select value={routeFilter} onChange={e => setRoute(e.target.value)}
                style={{ minWidth: 150 }}>
                <option value="all">Todas as rotas</option>
                {routes.map(r => {
                  const [o, d] = r.split('-') as [Origin, Destination]
                  return <option key={r} value={r}>{o} → {d}</option>
                })}
              </select>
            </div>
            <button
              className="btn-ghost"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              style={{ alignSelf: 'flex-end', height: 38, whiteSpace: 'nowrap' }}
            >
              {theme === 'light' ? '☾ Tema escuro' : '☀ Tema claro'}
            </button>
            {isLoggedIn ? (
              <button className="btn-ghost"
                onClick={() => supabase.auth.signOut()}
                style={{ alignSelf: 'flex-end', height: 38 }}
                title={user.email}>
                Sair
              </button>
            ) : (
              <button className="btn-ghost"
                onClick={() => setShowLogin(true)}
                style={{ alignSelf: 'flex-end', height: 38 }}>
                Entrar
              </button>
            )}
            {loading && (
              <span style={{ alignSelf: 'flex-end', fontSize: 11,
                color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                carregando...
              </span>
            )}
          </div>
        </header>

        {/* ── Sticky top block: form (só logado) + chart ── */}
        <div style={isNarrow ? styles.topBlockNarrow : (isLoggedIn ? styles.topBlock : styles.topBlockReadonly)}>
          {isLoggedIn && (
            <PriceForm
              onSaved={fetchData}
              editing={editing}
              onCancelEdit={() => setEditing(null)}
            />
          )}
          <PriceChart data={filteredData} routeLabel={routeLabel} isNarrow={isNarrow} />
        </div>

        <StatsBar data={filteredData} isNarrow={isNarrow} />

        <PriceTable
          data={data}
          routeFilter={routeFilter}
          isNarrow={isNarrow}
          canEdit={isLoggedIn}
          onRefresh={fetchData}
          onEdit={row => {
            setEditing(row)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />

      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1320,
    margin: '0 auto',
    padding: '28px 28px 64px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 18,
    flexWrap: 'wrap',
    borderBottom: '1px solid var(--border)',
    paddingBottom: 20,
    marginBottom: 28,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logoBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    background: 'linear-gradient(140deg,#e8433a,#f5a623)',
    boxShadow: '0 6px 18px -6px rgba(232,67,58,.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  h1: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 23,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--text)',
  },
  sub: {
    fontSize: 13,
    color: 'var(--text2)',
    marginTop: 2,
  },
  controls: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  topBlock: {
    display: 'grid',
    gridTemplateColumns: '460px minmax(0,1fr)',
    gap: 20,
    alignItems: 'stretch',
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg)',
    padding: '16px 0',
    marginTop: -16,
  },
  topBlockReadonly: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr)',
    gap: 20,
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg)',
    padding: '16px 0',
    marginTop: -16,
  },
  topBlockNarrow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: '16px 0',
    marginTop: -16,
  },
}
