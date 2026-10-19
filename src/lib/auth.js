import { supabase } from './supabase.js'

/**
 * Get the current session. Returns null if not signed in.
 */
export async function getSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      const mock = localStorage.getItem('tankondo_mock_session')
      if (mock) {
        try { return JSON.parse(mock) } catch {}
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    return session
  } catch (err) {
    console.warn('[auth] getSession error:', err.message)
    return null
  }
}

/**
 * Require auth — redirect to login if not signed in.
 * Allows instant offline testing / demo when ?id=demo or ?demo=1 is in URL.
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function requireAuth(redirectTo = '/') {
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search)
    if (params.get('id') === 'demo' || params.get('demo') === '1') {
      return {
        user: {
          id: 'demo-operator-id',
          email: 'demo@taekwondo.org',
          user_metadata: { name: 'Demo Operator' }
        }
      }
    }
  }

  const session = await getSession()
  if (!session) {
    window.location.href = redirectTo
    return null
  }
  return session
}

/**
 * Sign in with email + password.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

/**
 * Sign up with email + password.
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

/**
 * Sign out and redirect.
 */
export async function signOut(redirectTo = '/') {
  try {
    await supabase.auth.signOut()
  } catch (err) {
    console.warn('[auth] signOut error:', err.message)
  }
  window.location.href = redirectTo
}
