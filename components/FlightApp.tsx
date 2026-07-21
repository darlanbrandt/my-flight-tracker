'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, Trip, MileageBalance, KIND_LABELS } from '@/lib/supabase'
import TripSection   from '@/components/TripSection'
import MilesSection  from '@/components/MilesSection'
import TripManager   from '@/components/TripManager'
import SettingsModal from '@/components/SettingsModal'
import LoginForm     from '@/components/LoginForm'
import Toast         from '@/components/Toast'

type Tab = 'cash' | 'miles'

export type ToastType = 'success' | 'error' | 'info'
export type ToastMsg  = { id: number; message: string; type: ToastType }

export default function FlightApp() {
  const [user, setUser]             = useState<User | null | undefined>(undefined)
  const [showLogin, setShowLogin]   = useState(false)
  const [trips, setTrips]           = useState<Trip[]>([])
  const [tripId, setTripId]         = useState<number | null>(null)
  const [loadingTrips, setLoading]  = useState(true)
  const [showManager, setManager]   = useState(false)
  const [showSettings, setSettings] = useState(false)
  const [tab, setTab]               = useState<Tab>('cash')
  const [balances, setBalances]     = useState<MileageBalance[]>([])
  const [theme, setTheme]           = useState<'dark' | 'light'>('light')
  const [isNarrow, setIsNarrow]     = useState(false)
  const [toasts, setToasts]         = useState<ToastMsg[]>([])
  const containerRef                = useRef<HTMLDivElement>(null)
  const toastId                     = useRef(0)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId.current
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

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

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('trips')
      .select('*')
      .order('date_out', { ascending: true })
    const list = rows ?? []
    setTrips(list)
    setTripId(prev => {
      if (prev !== null && list.some(t => t.id === prev)) return prev
      const saved = Number(localStorage.getItem('selectedTripId'))
      if (saved && list.some(t => t.id === saved)) return saved
      // sem seleção salva: cai na primeira viagem cadastrada (menor id)
      return list.length ? Math.min(...list.map(t => t.id)) : null
    })
    setLoading(false)
  }, [])

  const selectTrip = useCallback((id: number) => {
    setTripId(id)
    localStorage.setItem('selectedTripId', String(id))
  }, [])

  const fetchBalances = useCallback(async () => {
    const { data: rows } = await supabase
      .from('mileage_balances')
      .select('*')
      .order('program', { ascending: true })
    setBalances(rows ?? [])
  }, [])

  useEffect(() => { fetchTrips() }, [fetchTrips])
  useEffect(() => { fetchBalances() }, [fetchBalances])

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
  const trip = trips.find(t => t.id === tripId) ?? null

  if (showLogin && !isLoggedIn) {
    return <LoginForm onCancel={() => setShowLogin(false)} />
  }

  return (
    <div ref={containerRef} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Toast toasts={toasts} />
      {showManager && (
        <TripManager
          trips={trips}
          onClose={() => setManager(false)}
          onChanged={fetchTrips}
          onToast={showToast}
        />
      )}
      {showSettings && (
        <SettingsModal
          balances={balances}
          onClose={() => setSettings(false)}
          onChanged={fetchBalances}
          onToast={showToast}
        />
      )}

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
                Acompanhamento diário de tarifas aéreas
              </p>
            </div>
          </div>

          <div style={styles.controls}>
            <button
              className="btn-ghost"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              style={{ alignSelf: 'flex-end', height: 38, whiteSpace: 'nowrap' }}
            >
              {theme === 'dark' ? '☾ Tema escuro' : '☀ Tema claro'}
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
          </div>
        </header>

        {/* ── Seletor de viagem ── */}
        <div style={styles.tripBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
            <span style={styles.tripLabel}>Viagem:</span>
            {trips.length > 0 && (
              <select
                value={tripId ?? ''}
                onChange={e => selectTrip(Number(e.target.value))}
                style={{ minWidth: 220, fontWeight: 600 }}
              >
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.period} ({KIND_LABELS[t.kind]})
                  </option>
                ))}
              </select>
            )}
            {trip && (
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                {trip.date_out.split('-').reverse().join('/')} → {trip.date_back.split('-').reverse().join('/')}
              </span>
            )}
          </div>
          {isLoggedIn && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setManager(true)}
                style={{ height: 36, whiteSpace: 'nowrap' }}>
                ✈ Viagens
              </button>
              <button className="btn-ghost" onClick={() => setSettings(true)}
                style={{ height: 36, whiteSpace: 'nowrap' }}>
                ⚙ Pontos
              </button>
            </div>
          )}
        </div>

        {/* ── Abas Dinheiro / Milhas ── */}
        <div style={{ marginBottom: 22 }}>
          <div className="segmented">
            <button className={tab === 'cash' ? 'active' : ''} onClick={() => setTab('cash')}>💵 Dinheiro</button>
            <button className={tab === 'miles' ? 'active' : ''} onClick={() => setTab('miles')}>🎫 Milhas</button>
          </div>
        </div>

        {/* ── Conteúdo da viagem ── */}
        {loadingTrips ? (
          <p style={styles.placeholder}>carregando viagens...</p>
        ) : trip ? (
          tab === 'cash' ? (
            <TripSection
              key={trip.id}
              trip={trip}
              isLoggedIn={isLoggedIn}
              isNarrow={isNarrow}
              onToast={showToast}
            />
          ) : (
            <MilesSection
              key={trip.id}
              trip={trip}
              balances={balances}
              isLoggedIn={isLoggedIn}
              isNarrow={isNarrow}
              onToast={showToast}
            />
          )
        ) : (
          <div style={styles.emptyState}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              Nenhuma viagem cadastrada
            </p>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>
              {isLoggedIn
                ? 'Clique em "Gerenciar viagens" para criar a primeira.'
                : 'Entre para cadastrar uma viagem.'}
            </p>
          </div>
        )}

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
    marginBottom: 22,
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--bg)',
    paddingTop: 28,
    marginTop: -28,
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
  tripBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 22,
  },
  tripLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  placeholder: {
    padding: 60,
    textAlign: 'center',
    color: 'var(--text3)',
    fontSize: 13,
    fontFamily: 'JetBrains Mono, monospace',
  },
  emptyState: {
    padding: '80px 20px',
    textAlign: 'center',
    background: 'var(--surface)',
    border: '1px dashed var(--border2)',
    borderRadius: 18,
  },
}
