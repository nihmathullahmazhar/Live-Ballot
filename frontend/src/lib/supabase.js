import { createClient } from '@supabase/supabase-js'

// These come from your .env file (see .env.example). We fall back to harmless
// placeholders so the app/build never crashes at import time if they're missing;
// real RPC calls will simply fail until you set them.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(url, anon)
export const supabaseUrl = url
export const supabaseAnonKey = anon

export const isConfigured =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)