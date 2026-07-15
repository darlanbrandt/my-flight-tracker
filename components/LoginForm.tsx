'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginForm({ onCancel }: { onCancel?: () => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) setError(err.message)
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logoBox}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4 1-4 1L8.8 8.2l-5.8-1a1 1 0 0 0-.9 1.7l3.6 3.6-.9 4.4a.5.5 0 0 0 .7.6l3.5-1.5 3.6 3.6a1 1 0 0 0 1.7-.9z"/>
          </svg>
        </div>
        <h1 style={styles.title}>Flight Price Tracker</h1>
        <p style={styles.sub}>Acesso restrito</p>

        <label style={styles.label}>
          E-mail
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            autoFocus
          />
        </label>

        <label style={styles.label}>
          Senha
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}
          style={{ width: '100%', padding: '11px', marginTop: 4 }}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}
            style={{ width: '100%', padding: '11px' }}>
            Voltar
          </button>
        )}
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 380,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    boxShadow: 'var(--shadow)',
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
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--text)',
  },
  sub: {
    fontSize: 13,
    color: 'var(--text3)',
    marginBottom: 8,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text2)',
  },
  error: {
    color: 'var(--red)',
    fontSize: 12.5,
  },
}
