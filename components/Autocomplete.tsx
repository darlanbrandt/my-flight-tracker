'use client'

import { useMemo, useRef, useState } from 'react'

export type AutocompleteOption = {
  value: string          // o que é gravado no campo
  label?: string         // texto extra exibido na lista (ex: nome da cidade)
}

type Props = {
  value: string
  onChange: (v: string) => void
  options: AutocompleteOption[]
  placeholder?: string
  mono?: boolean
  maxLength?: number
  uppercase?: boolean
  required?: boolean
}

export default function Autocomplete({
  value, onChange, options, placeholder, mono, maxLength, uppercase, required,
}: Props) {
  const [open, setOpen]           = useState(false)
  const [highlight, setHighlight] = useState(0)
  const listRef                   = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = value.toLowerCase().trim()
    if (!q) return options
    return options.filter(o =>
      o.value.toLowerCase().includes(q) ||
      (o.label ?? '').toLowerCase().includes(q)
    )
  }, [value, options])

  function select(v: string) {
    onChange(v)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
      scrollToItem(Math.min(highlight + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
      scrollToItem(Math.max(highlight - 1, 0))
    } else if (e.key === 'Enter') {
      if (filtered[highlight]) {
        e.preventDefault()
        select(filtered[highlight].value)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function scrollToItem(index: number) {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={mono ? 'mono-input' : undefined}
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        autoComplete="off"
        onChange={e => {
          onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => { setOpen(true); setHighlight(0) }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        style={{ width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div ref={listRef} style={styles.dropdown}>
          {filtered.map((o, i) => (
            <div
              key={o.value}
              onMouseDown={e => { e.preventDefault(); select(o.value) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                ...styles.option,
                background: i === highlight ? 'var(--surface2)' : 'transparent',
              }}
            >
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--text)' }}>
                {o.value}
              </span>
              {o.label && (
                <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>
                  {o.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    maxHeight: 300,
    overflowY: 'auto',
    background: 'var(--surface)',
    border: '1px solid var(--border2)',
    borderRadius: 10,
    boxShadow: '0 12px 32px -8px rgba(0,0,0,.35)',
    zIndex: 30,
  },
  option: {
    padding: '9px 12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'baseline',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
