/**
 * Simple toast notification helper.
 * Creates a container and appends toast messages.
 */
let container = null

function getContainer() {
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  return container
}

/**
 * Show a toast.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration  ms before auto-dismiss
 */
export function toast(message, type = 'info', duration = 3000) {
  const c = getContainer()
  const el = document.createElement('div')
  el.className = `toast toast--${type}`
  el.textContent = message
  c.appendChild(el)

  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 200ms'
    setTimeout(() => el.remove(), 200)
  }, duration)
}
