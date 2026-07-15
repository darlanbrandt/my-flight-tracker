'use client'

import { useState } from 'react'
import { supabase, Trip, TripInsert, TripKind, KIND_LABELS } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import type { ToastType } from '@/components/FlightApp'

type Props = {
  trips: Trip[]
  onClose: () => void
  onChanged: () => void
  onToast: (message: string, type: ToastType) => void
}

export default function TripManager({ trips, onClose, onChanged, onToast }: Props) {
  const [name, setName]         = useState('')
  const [period, setPeriod]     = useState('')
  const [kind, setKind]         = useState<TripKind>('domestica')
  const [dateOut, setDateOut]   = useState('')
  const [dateBack, setDateBack] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // exclusão em duas etapas (estilo GitHub: digitar o nome da viagem)
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [confirmText, setConfirmText]   = useState('')
  const [deleting, setDeleting]         = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim())   { setError('Informe o nome da viagem.'); return }
    if (!period.trim()) { setError('Informe o período (ex: Nov/2026).'); return }
    if (!dateOut || !dateBack) { setError('Informe as datas de ida e volta.'); return }
    if (dateBack < dateOut) { setError('A volta não pode ser antes da ida.'); return }

    setSaving(true)
    const payload: TripInsert = {
      name: name.trim(),
      period: period.trim(),
      kind,
      date_out: dateOut,
      date_back: dateBack,
    }
    const { error: err } = await supabase.from('trips').insert(payload)
    setSaving(false)

    if (err) { setError(err.message); return }

    setName(''); setPeriod(''); setDateOut(''); setDateBack('')
    onToast('Viagem criada!', 'success')
    onChanged()
  }

  async function handleDelete() {
    if (!deleteTarget || confirmText !== deleteTarget.name) return
    setDeleting(true)
    const { error: err } = await supabase.from('trips').delete().eq('id', deleteTarget.id)
    setDeleting(false)

    if (err) {
      onToast('Erro ao excluir viagem.', 'error')
      return
    }
    onToast(`Viagem "${deleteTarget.name}" excluída.`, 'success')
    setDeleteTarget(null)
    setConfirmText('')
    onChanged()
  }

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Minhas viagens</h2>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px 12px' }}>✕</button>
        </div>

        {/* lista */}
        <div style={styles.list}>
          {trips.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>
              Nenhuma viagem cadastrada.
            </p>
          )}
          {trips.map(t => (
            <div key={t.id} style={styles.tripRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                  <span style={styles.tripName}>{t.name}</span>
                  <span className="chip">{t.period}</span>
                  <span style={{
                    ...styles.kindBadge,
                    background: t.kind === 'internacional' ? 'rgba(47,127,209,.14)' : 'rgba(0,168,120,.14)',
                    color:      t.kind === 'internacional' ? '#2f7fd1' : '#00a878',
                  }}>
                    {KIND_LABELS[t.kind]}
                  </span>
                </div>
                <p style={styles.tripDates}>
                  {format(parseISO(t.date_out), 'dd/MM/yyyy')} → {format(parseISO(t.date_back), 'dd/MM/yyyy')}
                </p>
              </div>
              <button
                className="btn-danger"
                style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }}
                onClick={() => { setDeleteTarget(t); setConfirmText('') }}
              >
                Excluir
              </button>
            </div>
          ))}
        </div>

        {/* nova viagem */}
        <form onSubmit={handleCreate} style={styles.form}>
          <p style={styles.formTitle}>Nova viagem</p>
          <div style={styles.formGrid}>
            <label style={styles.label}>
              Nome
              <input type="text" placeholder="ex: Nova Iorque" value={name}
                onChange={e => setName(e.target.value)} required />
            </label>
            <label style={styles.label}>
              Período
              <input type="text" placeholder="ex: Nov/2026" value={period}
                onChange={e => setPeriod(e.target.value)} required />
            </label>
            <label style={styles.label}>
              Tipo
              <select value={kind} onChange={e => setKind(e.target.value as TripKind)}>
                <option value="domestica">Doméstica</option>
                <option value="internacional">Internacional</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...styles.label, flex: 1 }}>
                Ida
                <input type="date" value={dateOut} onChange={e => setDateOut(e.target.value)} required />
              </label>
              <label style={{ ...styles.label, flex: 1 }}>
                Volta
                <input type="date" value={dateBack} onChange={e => setDateBack(e.target.value)} required />
              </label>
            </div>
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: 12.5 }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={saving}
            style={{ padding: '10px 22px', alignSelf: 'flex-end' }}>
            {saving ? 'Salvando...' : 'Criar viagem'}
          </button>
        </form>
      </div>

      {/* modal de confirmação de exclusão */}
      {deleteTarget && (
        <div style={{ ...styles.overlay, zIndex: 60 }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div style={{ ...styles.modal, maxWidth: 440 }}>
            <h3 style={{ ...styles.modalTitle, fontSize: 16, marginBottom: 4 }}>
              Excluir “{deleteTarget.name}”?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
              Esta ação é <strong style={{ color: 'var(--red)' }}>irreversível</strong>.
              Todos os registros de preços desta viagem (manuais e automáticos)
              serão excluídos permanentemente.
            </p>
            <label style={{ ...styles.label, marginTop: 6 }}>
              Digite <strong style={{ userSelect: 'none' }}>{deleteTarget.name}</strong> para confirmar
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={deleteTarget.name}
                autoFocus
              />
            </label>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button
                className="btn-danger"
                style={{
                  padding: '9px 18px',
                  opacity: confirmText === deleteTarget.name ? 1 : 0.45,
                  cursor:  confirmText === deleteTarget.name ? 'pointer' : 'not-allowed',
                }}
                disabled={confirmText !== deleteTarget.name || deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Excluindo...' : 'Excluir esta viagem'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.45)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modal: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 560,
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 24px 60px -12px rgba(0,0,0,.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  tripRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid var(--border)',
  },
  tripName: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text)',
  },
  tripDates: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11.5,
    color: 'var(--text3)',
    marginTop: 4,
  },
  kindBadge: {
    fontSize: 10.5,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 7,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    paddingTop: 6,
  },
  formTitle: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text)',
  },
  formGrid: {
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
}
