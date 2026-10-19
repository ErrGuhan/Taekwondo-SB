import { supabase } from './supabase.js'

/**
 * Get the current session. Returns null if not signed in.
 */
export async function getSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  } catch (err) {
    console.warn('[auth] getSession error:', err.message)
    return null
  }
}

/**
 * Require auth — redirect to login if not signed in.
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function requireAuth(redirectTo = '/') {
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
