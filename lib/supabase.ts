import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Viagens ───────────────────────────────────────────────────────────────────

export type TripKind = 'internacional' | 'domestica'

export type Trip = {
  id: number
  name: string
  period: string
  kind: TripKind
  date_out: string
  date_back: string
  created_at: string
}

export type TripInsert = {
  name: string
  period: string
  kind: TripKind
  date_out: string
  date_back: string
}

export const KIND_LABELS: Record<TripKind, string> = {
  internacional: 'Internacional',
  domestica:     'Doméstica',
}

// ── Preços ────────────────────────────────────────────────────────────────────

export type TripType = 'outbound' | 'return' | 'round_trip'
export type PriceSource = 'manual' | 'auto'

export type Price = {
  id: string
  trip_id: number
  date: string
  airline: string
  origin: string
  destination: string
  trip_type: TripType
  price_out: number | null
  price_back: number | null
  total: number
  source: PriceSource
  notes: string | null
  created_at: string
}

export type PriceInsert = {
  trip_id: number
  date: string
  airline: string
  origin: string
  destination: string
  trip_type: TripType
  price_out?: number | null
  price_back?: number | null
  source?: PriceSource
  notes?: string
}

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  outbound:   'Só ida',
  return:     'Só volta',
  round_trip: 'Ida e volta',
}

// ── Cores por companhia ───────────────────────────────────────────────────────
// Companhias conhecidas têm cor fixa; as demais recebem cores da paleta
// na ordem em que aparecem.

const KNOWN_AIRLINE_COLORS: Record<string, string> = {
  'gol':        '#FF6600',
  'latam':      '#7B61FF',
  'arajet':     '#e8433a',
  'avianca':    '#f5a623',
  'american':   '#2f7fd1',
  'copa':       '#0f62ac',
  'azul':       '#00a1e0',
  'air canada': '#d22630',
  'united':     '#4f7bd9',
  'delta':      '#a01c3a',
  'tap':        '#00a887',
  'aerolineas': '#5fc2e0',
}

const PALETTE = [
  '#e8433a', '#f5a623', '#2f7fd1', '#00a878', '#9b59b6',
  '#e91e8c', '#00b8d9', '#8d6e63', '#c0ca33', '#607d8b',
]

export function buildAirlineColors(airlines: string[]): Record<string, string> {
  const colors: Record<string, string> = {}
  let i = 0
  for (const a of airlines) {
    const known = KNOWN_AIRLINE_COLORS[a.toLowerCase().trim()]
    colors[a] = known ?? PALETTE[i++ % PALETTE.length]
  }
  return colors
}

// Sugestões de aeroportos para o formulário (a Fase 4 traz busca completa)
export const AIRPORT_SUGGESTIONS: Record<string, string> = {
  FLN: 'Florianópolis',
  GRU: 'São Paulo — Guarulhos',
  CGH: 'São Paulo — Congonhas',
  VCP: 'Campinas — Viracopos',
  GIG: 'Rio de Janeiro — Galeão',
  SDU: 'Rio de Janeiro — Santos Dumont',
  BSB: 'Brasília',
  CNF: 'Belo Horizonte — Confins',
  POA: 'Porto Alegre',
  CWB: 'Curitiba',
  SSA: 'Salvador',
  REC: 'Recife',
  FOR: 'Fortaleza',
  NAT: 'Natal',
  MCZ: 'Maceió',
  EWR: 'New York — Newark',
  JFK: 'New York — JFK',
  LGA: 'New York — LaGuardia',
  IAD: 'Washington DC — Dulles',
  MIA: 'Miami',
  MCO: 'Orlando',
  DFW: 'Dallas — Fort Worth',
  BOS: 'Boston',
  YYZ: 'Toronto',
  LIS: 'Lisboa',
  MAD: 'Madri',
  PTY: 'Cidade do Panamá',
  SCL: 'Santiago',
  EZE: 'Buenos Aires — Ezeiza',
}
