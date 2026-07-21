'use client'

import { useState } from 'react'
import { supabase, MileageBalance, PROGRAM_SUGGESTIONS } from '@/lib/supabase'
import type { ToastType } from '@/components/FlightApp'

type Props = {
  balances: MileageBalance[]
  onClose: () => void
  onChanged: () => void
  onToast: (message: string, type: ToastType) => void
}

export default function SettingsModal({ balances, onClose, onChanged, onToast }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>(
    Object.fromEntries(balances.map(b => [b.id, String(b.balance)]))
  )
  const [savingId, setSavingId] = useState<number | null>(null)

  // novo programa
  const [newName, setNewName] = useState('')
  const [newBal, setNewBal]   = useState('')
  const [adding, setAdding]   = useState(false)

  async function saveBalance(b: MileageBalance) {
    const val = parseInt((drafts[b.id] ?? '').replace(/\D/g, ''), 10)
    if (isNaN(val)) { onToast('Valor inválido.', 'error'); return }
    setSavingId(b.id)
    const { error } = await supabase
      .from('mileage_balances')
      .update({ balance: val, updated_at: new Date().toISOString() })
      .eq('id', b.id)
    setSavingId(null)
    if (error) onToast('Erro ao salvar.', 'error')
    else { onToast(`${b.program} atualizado.`, 'success'); onChanged() }
  }

  async function addProgram(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const val = parseInt(newBal.replace(/\D/g, ''), 10) || 0
    setAdding(true)
    const { error } = await supabase.from('mileage_balances').insert({ program: newName.trim(), balance: val })
    setAdding(false)
    if (error) { onToast(error.message.includes('duplicate') ? 'Programa já existe.' : 'Erro ao adicionar.', 'error'); return }
    setNewName(''); setNewBal('')
    onToast('Programa adicionado.', 'success')
    onChanged()
  }

  async function removeProgram(b: MileageBalance) {
    if (!confirm(`Remover o programa "${b.program}"?`)) return
    const { error } = await supabase.from('mileage_balances').delete().eq('id', b.id)
    if (error) onToast('Erro ao remover.', 'error')
    else { onToast('Programa removido.', 'success'); onChanged() }
  }

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Meus programas de milhas</h2>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px 12px' }}>✕</button>
        </div>

        <p style={styles.sub}>Atualize seu saldo de pontos em cada programa.</p>

        <div style={styles.list}>
          {balances.map(b => (
            <div key={b.id} style={styles.row}>
              <span style={styles.program}>{b.program}</span>
              <input
                className="mono-input"
                type="text"
                value={drafts[b.id] ?? ''}
                onChange={e => setDrafts(d => ({ ...d, [b.id]: e.target.value }))}
                style={{ width: 120, textAlign: 'right' }}
              />
              <button className="btn-primary" style={{ padding: '7px 14px', fontSize: 12 }}
                disabled={savingId === b.id} onClick={() => saveBalance(b)}>
                {savingId === b.id ? '...' : 'Salvar'}
              </button>
              <button className="btn-danger" style={{ width: 32, height: 32, padding: 0 }}
                title="Remover" onClick={() => removeProgram(b)}>🗑</button>
            </div>
          ))}
          {balances.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum programa ainda.</p>}
        </div>

        <form onSubmit={addProgram} style={styles.addForm}>
          <p style={styles.addTitle}>Adicionar programa</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <input type="text" list="program-opts" placeholder="ex: TudoAzul" value={newName}
              onChange={e => setNewName(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <datalist id="program-opts">
              {PROGRAM_SUGGESTIONS.map(p => <option key={p} value={p} />)}
            </datalist>
            <input className="mono-input" type="text" placeholder="saldo" value={newBal}
              onChange={e => setNewBal(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
            <button type="submit" className="btn-ghost" disabled={adding} style={{ padding: '8px 16px' }}>
              {adding ? '...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24,
    width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto',
    boxShadow: '0 24px 60px -12px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', gap: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text3)' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  program: { flex: 1, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14 },
  addTitle: { fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text)' },
}
