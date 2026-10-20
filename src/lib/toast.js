import { addNotification } from './notifications.js'

/**
 * Toast notification helper.
 * Appends transient toast messages to the DOM and automatically records
 * them in the centralized notification drawer store.
 */
let container = null

function getContainer() {
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    container.setAttribute('aria-live', 'polite')
    container.setAttribute('aria-atomic', 'true')
    document.body.appendChild(container)
  }
  return container
}

/**
 * Show a toast notification and log to the notification store.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {number} [duration=3000] - ms before auto-dismiss
 * @param {Object} [options={}] - Extra options
 * @param {boolean} [options.silent=false] - If true, do not log to notification history
 * @param {'match'|'system'|'alert'} [options.category] - Custom category
 * @param {string} [options.title] - Custom title for notification drawer
 */
export function toast(message, type = 'info', duration = 3000, options = {}) {
  const c = getContainer()
  const el = document.createElement('div')
  el.className = `toast toast--${type}`
  el.textContent = message
  c.appendChild(el)

  // Auto-record to notification drawer unless explicitly silenced
  if (!options.silent) {
    let category = options.category
    if (!category) {
      if (type === 'error' || type === 'warning') category = 'alert'
      else if (message.includes('Demo') || message.includes('Round') || message.includes('Score') || message.includes('Gam-jeom') || message.includes('Horn')) category = 'match'
      else category = 'system'
    }

    const title = options.title || (
      type === 'error' ? 'Error Alert' :
      type === 'warning' ? 'Match Warning' :
      type === 'success' ? 'Success' : 'Match Notice'
    )

    try {
      addNotification({
        title,
        message,
        type,
        category
      })
    } catch (e) {
      console.warn('[Toast] Could not append to notification store:', e)
    }
  }

  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(10px)'
    el.style.transition = 'opacity 200ms ease, transform 200ms ease'
    setTimeout(() => el.remove(), 200)
  }, duration)
}
