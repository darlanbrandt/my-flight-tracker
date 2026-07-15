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
  // Brasil / América do Sul e Central
  'gol':        '#FF6600',
  'latam':      '#1B0088',
  'azul':       '#00a1e0',
  'arajet':     '#e8433a',
  'avianca':    '#f5a623',
  'copa':       '#0f62ac',
  'sky':        '#7a4dbf',   // Sky Airline (Chile)
  'jetsmart':   '#c2185b',   // JetSmart (Chile/Argentina)
  'wingo':      '#8e5bd4',   // Wingo (Colômbia)
  'volaris':    '#a4459f',   // Volaris (México/América Central)
  'aeromexico': '#0f4c81',
  'aerolineas': '#5fc2e0',
  'boa':        '#2e7d32',   // Boliviana de Aviación
  // América do Norte
  'american':   '#2f7fd1',
  'united':     '#4f7bd9',
  'delta':      '#a01c3a',
  'air canada': '#d22630',
  'jetblue':    '#1a3ba5',
  // Europa
  'tap':        '#00a887',
  'iberia':     '#d7192d',
  'air france': '#4d64c8',
  'klm':        '#00a1de',
  'lufthansa':  '#e0a800',
  'british':    '#2e5c99',   // British Airways
  'swiss':      '#c8102e',
  'ita':        '#3b6fd4',   // ITA Airways
  'air europa': '#3ba7c4',
  // Low costs europeias
  'ryanair':    '#2a5cc8',
  'easyjet':    '#f28c28',
  'vueling':    '#d9b300',
  'wizz':       '#c6007e',
  'transavia':  '#00a95c',
  'norwegian':  '#d81939',
  'eurowings':  '#a01441',
}

// Sugestões de companhias para o formulário (o campo continua livre)
export const AIRLINE_SUGGESTIONS: string[] = [
  'Gol', 'LATAM', 'Azul',
  'Arajet', 'Avianca', 'Copa', 'Sky', 'JetSmart', 'Wingo', 'Volaris',
  'Aeroméxico', 'Aerolíneas Argentinas', 'BoA',
  'American', 'United', 'Delta', 'Air Canada', 'JetBlue',
  'TAP', 'Iberia', 'Air France', 'KLM', 'Lufthansa', 'British Airways',
  'Swiss', 'ITA Airways', 'Air Europa',
  'Ryanair', 'easyJet', 'Vueling', 'Wizz Air', 'Transavia', 'Norwegian', 'Eurowings',
]

const PALETTE = [
  '#e8433a', '#f5a623', '#2f7fd1', '#00a878', '#9b59b6',
  '#e91e8c', '#00b8d9', '#8d6e63', '#c0ca33', '#607d8b',
]

function knownColor(name: string): string | undefined {
  const n = name.toLowerCase().trim()
  if (KNOWN_AIRLINE_COLORS[n]) return KNOWN_AIRLINE_COLORS[n]
  // casa por trecho: "British Airways" → 'british', "GOL Linhas Aéreas" → 'gol'
  for (const [key, color] of Object.entries(KNOWN_AIRLINE_COLORS)) {
    if (n.includes(key)) return color
  }
  return undefined
}

export function buildAirlineColors(airlines: string[]): Record<string, string> {
  const colors: Record<string, string> = {}
  let i = 0
  for (const a of airlines) {
    colors[a] = knownColor(a) ?? PALETTE[i++ % PALETTE.length]
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
  // Estados Unidos / Canadá
  EWR: 'New York — Newark',
  JFK: 'New York — JFK',
  LGA: 'New York — LaGuardia',
  IAD: 'Washington DC — Dulles',
  MIA: 'Miami',
  FLL: 'Fort Lauderdale',
  MCO: 'Orlando',
  DFW: 'Dallas — Fort Worth',
  BOS: 'Boston',
  LAX: 'Los Angeles',
  SFO: 'San Francisco',
  LAS: 'Las Vegas',
  ORD: "Chicago — O'Hare",
  ATL: 'Atlanta',
  YYZ: 'Toronto',
  // América do Sul e Central
  SCL: 'Santiago',
  EZE: 'Buenos Aires — Ezeiza',
  LIM: 'Lima',
  BOG: 'Bogotá',
  PTY: 'Cidade do Panamá',
  SDQ: 'Santo Domingo',
  PUJ: 'Punta Cana',
  MEX: 'Cidade do México',
  CUN: 'Cancún',
  // Europa
  LIS: 'Lisboa',
  OPO: 'Porto',
  MAD: 'Madri',
  BCN: 'Barcelona',
  CDG: 'Paris — Charles de Gaulle',
  ORY: 'Paris — Orly',
  BVA: 'Paris — Beauvais',
  FCO: 'Roma — Fiumicino',
  CIA: 'Roma — Ciampino',
  BER: 'Berlim',
  LHR: 'Londres — Heathrow',
  LGW: 'Londres — Gatwick',
  STN: 'Londres — Stansted',
  LTN: 'Londres — Luton',
  BRU: 'Bruxelas',
  AMS: 'Amsterdã',
  FRA: 'Frankfurt',
  MUC: 'Munique',
  ZRH: 'Zurique',
  MXP: 'Milão — Malpensa',
  DUB: 'Dublin',
  // Leste europeu / Mediterrâneo
  VIE: 'Viena',
  PRG: 'Praga',
  BUD: 'Budapeste',
  WAW: 'Varsóvia',
  KRK: 'Cracóvia',
  OTP: 'Bucareste',
  SOF: 'Sófia',
  BOJ: 'Burgas',
  ATH: 'Atenas',
  SKG: 'Tessalônica',
  JTR: 'Santorini',
  ZAG: 'Zagreb',
  SPU: 'Split',
  DBV: 'Dubrovnik',
  BEG: 'Belgrado',
}
