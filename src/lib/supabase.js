import { createClient } from '@supabase/supabase-js'

export function getSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const localUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('tankondo_supabase_url') : null
  const localKey = typeof localStorage !== 'undefined' ? localStorage.getItem('tankondo_supabase_key') : null

  const url = (envUrl && !envUrl.includes('YOUR_PROJECT')) ? envUrl : (localUrl || '')
  const key = (envKey && !envKey.includes('YOUR_ANON_KEY')) ? envKey : (localKey || '')

  return { url, key }
}

export function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig()
  return Boolean(url && key && url.startsWith('http'))
}

export function saveSupabaseConfig(url, key) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('tankondo_supabase_url', url.trim())
    localStorage.setItem('tankondo_supabase_key', key.trim())
  }
}

const config = getSupabaseConfig()
const validUrl = config.url || 'https://placeholder.supabase.co'
const validKey = config.key || 'placeholder-anon-key'

export const supabase = createClient(validUrl, validKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
})
