'use client'

import type { ToastMsg } from '@/components/FlightApp'

const COLORS: Record<ToastMsg['type'], { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(22,163,74,0.12)',  border: 'rgba(22,163,74,0.35)',  icon: '✓' },
  error:   { bg: 'rgba(220,38,38,0.12)',  border: 'rgba(220,38,38,0.35)',  icon: '✕' },
  info:    { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.30)', icon: 'ℹ' },
}

export default function Toast({ toasts }: { toasts: ToastMsg[] }) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      right: 28,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type]
        return (
          <div key={t.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--surface)',
            border: `1px solid ${c.border}`,
            borderLeft: `4px solid ${c.border}`,
            borderRadius: 12,
            padding: '12px 18px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: 240,
            maxWidth: 360,
            animation: 'toast-in 0.2s ease',
          }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700,
              fontSize: 13,
              color: c.border,
              flexShrink: 0,
            }}>
              {c.icon}
            </span>
            <span style={{
              fontFamily: 'Hanken Grotesk, sans-serif',
              fontSize: 13,
              color: 'var(--text)',
              lineHeight: 1.4,
            }}>
              {t.message}
            </span>
          </div>
        )
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
