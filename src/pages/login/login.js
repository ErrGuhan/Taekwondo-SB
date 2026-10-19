import { getSession, signIn, signUp } from '../../lib/auth.js'

// If already signed in, go straight to setup
;(async () => {
  const session = await getSession()
  if (session) {
    window.location.href = '/pages/setup/'
  }
})()

let isSignUp = false

const form      = document.getElementById('login-form')
const emailEl   = document.getElementById('email')
const passwordEl= document.getElementById('password')
const submitBtn = document.getElementById('submit-btn')
const errEl     = document.getElementById('error-msg')
const toggleBtn = document.getElementById('toggle-btn')
const titleEl   = document.getElementById('page-title')
const subtitleEl= document.getElementById('page-subtitle')

function showError(msg, isSuccess = false) {
  errEl.textContent = msg
  errEl.classList.toggle('error-msg--success', isSuccess)
  errEl.classList.add('error-msg--show')
}
function clearError() {
  errEl.classList.remove('error-msg--show')
  errEl.classList.remove('error-msg--success')
}

toggleBtn.addEventListener('click', () => {
  isSignUp = !isSignUp
  titleEl.textContent    = isSignUp ? 'Create Account' : 'Operator Login'
  subtitleEl.textContent = isSignUp ? 'Register as an operator' : 'Sign in to score a match'
  submitBtn.textContent  = isSignUp ? 'Create Account' : 'Sign In'
  toggleBtn.textContent  = isSignUp ? 'Already have an account? Sign in' : 'Create one'
  clearError()
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearError()

  const email    = emailEl.value.trim()
  const password = passwordEl.value

  if (!email || !password) {
    showError('Please fill in all fields.')
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = isSignUp ? 'Creating…' : 'Signing in…'

  try {
    if (isSignUp) {
      const data = await signUp(email, password)
      if (data?.session) {
        window.location.href = '/pages/setup/'
      } else {
        showError('✓ Account created! If confirmation is required, check your email, then sign in.', true)
        isSignUp = false
        titleEl.textContent    = 'Operator Login'
        subtitleEl.textContent = 'Sign in to score a match'
        submitBtn.textContent  = 'Sign In'
        toggleBtn.textContent  = 'Create one'
      }
    } else {
      await signIn(email, password)
      window.location.href = '/pages/setup/'
    }
  } catch (err) {
    showError(err.message || 'Authentication failed.')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In'
  }
})

