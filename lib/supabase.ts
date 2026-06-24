import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Airline     = 'Arajet' | 'Avianca' | 'American'
export type Origin      = 'GRU' | 'GIG'
export type Destination = 'EWR' | 'JFK' | 'IAD' | 'MIA' | 'DFW'

export const AIRLINE_COLORS: Record<Airline, string> = {
  Arajet:   '#e8433a',
  Avianca:  '#f5a623',
  American: '#2f7fd1',
}

export const AIRLINE_DIM_DARK: Record<Airline, string> = {
  Arajet:   '#3a1714',
  Avianca:  '#3a2a0c',
  American: '#142536',
}

export const AIRLINE_DIM_LIGHT: Record<Airline, string> = {
  Arajet:   '#fdecea',
  Avianca:  '#fdf3e0',
  American: '#e7f0fb',
}

export const ORIGINS: Record<Origin, string> = {
  GRU: 'São Paulo - Guarulhos',
  GIG: 'Rio de Janeiro - Galeão',
}

export const DESTINATIONS: Record<Destination, string> = {
  EWR: 'New York - Newark',
  JFK: 'New York - JFK',
  IAD: 'Washington DC - Dulles',
  MIA: 'Miami',
  DFW: 'Dallas - Fort Worth',
}

export const DESTINATIONS_BY_AIRLINE: Record<Airline, Destination[]> = {
  Arajet:   ['EWR', 'IAD'],
  Avianca:  ['EWR', 'JFK', 'IAD'],
  American: ['EWR', 'MIA', 'JFK', 'DFW'],
}

export type RouteKey = 'all' | string

export type FlightPrice = {
  id: string
  date: string
  airline: Airline
  origin: Origin
  destination: Destination
  price_out: number
  price_back: number
  total: number
  notes: string | null
  created_at: string
}

export type FlightPriceInsert = {
  date: string
  airline: Airline
  origin: Origin
  destination: Destination
  price_out: number
  price_back: number
  notes?: string
}
