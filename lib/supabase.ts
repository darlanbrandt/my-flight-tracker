import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Origin      = 'GRU' | 'GIG'
export type Destination = 'EWR' | 'JFK' | 'IAD'

export const ORIGINS: Record<Origin, string> = {
  GRU: 'São Paulo - Guarulhos',
  GIG: 'Rio de Janeiro - Galeão',
}

export const DESTINATIONS: Record<Destination, string> = {
  EWR: 'New York - Newark',
  JFK: 'New York - JFK',
  IAD: 'Washington DC - Dulles',
}

// JFK não opera na Arajet
export const DESTINATIONS_BY_AIRLINE: Record<'Arajet' | 'Avianca', Destination[]> = {
  Arajet:  ['EWR', 'IAD'],
  Avianca: ['EWR', 'JFK', 'IAD'],
}

export type FlightPrice = {
  id: string
  date: string
  airline: 'Arajet' | 'Avianca'
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
  airline: 'Arajet' | 'Avianca'
  origin: Origin
  destination: Destination
  price_out: number
  price_back: number
  notes?: string
}
