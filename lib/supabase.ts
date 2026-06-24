import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type FlightPrice = {
  id: string
  date: string
  airline: 'Arajet' | 'Avianca'
  price_out: number
  price_back: number
  total: number
  notes: string | null
  created_at: string
}

export type FlightPriceInsert = {
  date: string
  airline: 'Arajet' | 'Avianca'
  price_out: number
  price_back: number
  notes?: string
}
