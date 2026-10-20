/**
 * Centralized Notification Store for TankondoSB.
 * Persists match events, system alerts, and notifications in localStorage
 * with cross-tab synchronization and listener support.
 */

const STORAGE_KEY = 'tankondo_notifications_v1'
const MAX_NOTIFICATIONS = 60

let inMemoryStore = []
const listeners = new Set()

/**
 * Safely read from localStorage.
 * @returns {Array}
 */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        inMemoryStore = parsed
        return inMemoryStore
      }
    }
  } catch (e) {
    console.warn('[Notifications] Could not read from localStorage:', e)
  }
  return inMemoryStore
}

/**
 * Safely persist to localStorage and notify listeners.
 */
function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryStore.slice(0, MAX_NOTIFICATIONS)))
  } catch (e) {
    console.warn('[Notifications] Could not persist to localStorage:', e)
  }
  notifyListeners()
}

function notifyListeners() {
  const current = [...inMemoryStore]
  listeners.forEach((fn) => {
    try {
      fn(current)
    } catch (err) {
      console.error('[Notifications] Listener error:', err)
    }
  })
}

// Initial load
loadStore()

// Listen for updates from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      loadStore()
      notifyListeners()
    }
  })
}

/**
 * Add a notification.
 * @param {Object} options
 * @param {string} options.title - Short title (e.g. "Gam-jeom", "Timer Expired", "Connected")
 * @param {string} [options.message] - Detailed message
 * @param {'info'|'success'|'warning'|'error'} [options.type='info'] - Severity/type
 * @param {'match'|'system'|'alert'} [options.category='match'] - Event category
 * @param {any} [options.data] - Optional metadata
 * @returns {Object} the newly created notification item
 */
export function addNotification({
  title,
  message = '',
  type = 'info',
  category = 'match',
  data = null
}) {
  const item = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(title || 'Notification'),
    message: String(message || ''),
    type: ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info',
    category: ['match', 'system', 'alert'].includes(category) ? category : 'match',
    data,
    timestamp: Date.now(),
    read: false
  }

  // Prepend new item
  inMemoryStore = [item, ...inMemoryStore].slice(0, MAX_NOTIFICATIONS)
  saveStore()
  return item
}

/**
 * Get all notifications.
 * @returns {Array}
 */
export function getNotifications() {
  return [...inMemoryStore]
}

/**
 * Get count of unread notifications.
 * @returns {number}
 */
export function getUnreadCount() {
  return inMemoryStore.filter((n) => !n.read).length
}

/**
 * Mark a single notification as read.
 * @param {string} id
 */
export function markAsRead(id) {
  let changed = false
  inMemoryStore = inMemoryStore.map((item) => {
    if (item.id === id && !item.read) {
      changed = true
      return { ...item, read: true }
    }
    return item
  })
  if (changed) saveStore()
}

/**
 * Mark all notifications as read.
 */
export function markAllRead() {
  let changed = false
  inMemoryStore = inMemoryStore.map((item) => {
    if (!item.read) {
      changed = true
      return { ...item, read: true }
    }
    return item
  })
  if (changed) saveStore()
}

/**
 * Clear all notifications.
 */
export function clearAll() {
  inMemoryStore = []
  saveStore()
}

/**
 * Subscribe to notification store changes.
 * @param {Function} callback
 * @returns {Function} unsubscribe function
 */
export function onNotificationChange(callback) {
  listeners.add(callback)
  // Call immediately with current state
  try {
    callback([...inMemoryStore])
  } catch (err) {
    console.error('[Notifications] Initial callback error:', err)
  }
  return () => listeners.delete(callback)
}
