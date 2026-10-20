import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markAsRead,
  clearAll,
  onNotificationChange
} from './notifications.js'

/**
 * In-App Notification Drawer & Floating Bell Component for TankondoSB.
 * Mounts across all pages (Login, Setup, Control, Scoreboard, Error pages).
 */

let drawerEl = null
let backdropEl = null
let bellBtn = null
let badgeEl = null
let listEl = null
let activeFilter = 'all' // 'all' | 'match' | 'system' | 'alert'
let isOpen = false

/** Format relative or short time */
function formatTime(timestamp) {
  if (!timestamp) return ''
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 10) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Get appropriate icon based on category and type */
function getItemIcon(item) {
  if (item.type === 'error') return '⚠️'
  if (item.type === 'warning') return '⚡'
  if (item.type === 'success') return '✓'
  if (item.category === 'match') return '🥋'
  if (item.category === 'system') return '☁️'
  return '🔔'
}

/** Render notification cards */
function renderList() {
  if (!listEl) return
  const allItems = getNotifications()

  let filtered = allItems
  if (activeFilter === 'match') {
    filtered = allItems.filter(n => n.category === 'match')
  } else if (activeFilter === 'system') {
    filtered = allItems.filter(n => n.category === 'system')
  } else if (activeFilter === 'alert') {
    filtered = allItems.filter(n => n.category === 'alert' || n.type === 'error' || n.type === 'warning')
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty" role="status">
        <div class="notif-empty-icon" aria-hidden="true">🔔</div>
        <p class="notif-empty-title">No notifications</p>
        <p class="notif-empty-desc">
          ${activeFilter === 'all' 
            ? 'Match events, referee alerts, and system notices will appear here.'
            : `No ${activeFilter} notifications logged in this session.`}
        </p>
      </div>
    `
    return
  }

  listEl.innerHTML = ''
  filtered.forEach(item => {
    const card = document.createElement('div')
    card.className = `notif-item notif-item--${item.type} ${item.read ? 'notif-item--read' : ''}`
    card.setAttribute('role', 'article')
    card.tabIndex = 0

    const icon = getItemIcon(item)
    const timeStr = formatTime(item.timestamp)

    card.innerHTML = `
      <div class="notif-item-icon" aria-hidden="true">${icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-header">
          <span class="notif-item-title">${escapeHtml(item.title)}</span>
          <span class="notif-item-time">${timeStr}</span>
        </div>
        ${item.message ? `<div class="notif-item-msg">${escapeHtml(item.message)}</div>` : ''}
      </div>
      ${!item.read ? `<span class="notif-item-dot" title="Unread" aria-label="Unread"></span>` : ''}
    `

    card.addEventListener('click', () => {
      markAsRead(item.id)
    })
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        markAsRead(item.id)
      }
    })

    listEl.appendChild(card)
  })
}

function updateBadge() {
  const count = getUnreadCount()
  if (!badgeEl) return
  if (count > 0) {
    badgeEl.textContent = count > 99 ? '99+' : String(count)
    badgeEl.classList.remove('notif-badge--hidden')
  } else {
    badgeEl.classList.add('notif-badge--hidden')
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function openDrawer() {
  if (isOpen || !drawerEl || !backdropEl) return
  isOpen = true
  drawerEl.classList.add('notif-drawer--open')
  backdropEl.classList.add('notif-drawer-backdrop--open')
  drawerEl.setAttribute('aria-hidden', 'false')
  renderList()
  updateBadge()
  // Focus the close button for accessibility
  const closeBtn = drawerEl.querySelector('#notif-close-btn')
  if (closeBtn) closeBtn.focus()
}

export function closeDrawer() {
  if (!isOpen || !drawerEl || !backdropEl) return
  isOpen = false
  drawerEl.classList.remove('notif-drawer--open')
  backdropEl.classList.remove('notif-drawer-backdrop--open')
  drawerEl.setAttribute('aria-hidden', 'true')
  if (bellBtn) bellBtn.focus()
}

export function toggleDrawer() {
  if (isOpen) {
    closeDrawer()
  } else {
    openDrawer()
  }
}

/** Build and inject DOM elements */
export function initNotificationDrawer() {
  if (document.getElementById('notif-root')) return // Already initialized

  const root = document.createElement('div')
  root.id = 'notif-root'

  // Determine if we're on the public broadcast scoreboard
  const isScoreboard = window.location.pathname.includes('/scoreboard') || !!document.querySelector('.sb-root')

  root.innerHTML = `
    <!-- Floating Bell Button -->
    <button
      id="notif-bell-btn"
      class="notif-bell clay ${isScoreboard ? 'bell--broadcast' : ''}"
      type="button"
      aria-label="Open notifications"
      title="Notifications (Alt+N)"
    >
      <svg class="notif-bell-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      <span id="notif-badge" class="notif-badge notif-badge--hidden" aria-hidden="true">0</span>
    </button>

    <!-- Backdrop Overlay -->
    <div id="notif-backdrop" class="notif-drawer-backdrop" aria-hidden="true"></div>

    <!-- Slide-Over Drawer -->
    <aside
      id="notif-drawer"
      class="notif-drawer glass flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Notification center"
      aria-hidden="true"
    >
      <div class="notif-header">
        <div class="notif-header-title">
          <span class="notif-title-icon" aria-hidden="true">🔔</span>
          <h2>Notifications</h2>
        </div>
        <div class="notif-header-actions">
          <button type="button" id="notif-mark-read-btn" class="notif-action-btn" title="Mark all notifications as read">
            Mark Read
          </button>
          <button type="button" id="notif-clear-btn" class="notif-action-btn" title="Clear notification history">
            Clear
          </button>
          <button type="button" id="notif-close-btn" class="notif-close-btn" aria-label="Close notification panel">
            ✕
          </button>
        </div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="notif-tabs" role="tablist" aria-label="Filter notifications">
        <button type="button" class="notif-tab notif-tab--active" data-filter="all" role="tab" aria-selected="true">
          All
        </button>
        <button type="button" class="notif-tab" data-filter="match" role="tab" aria-selected="false">
          Match Events
        </button>
        <button type="button" class="notif-tab" data-filter="system" role="tab" aria-selected="false">
          System Alerts
        </button>
      </div>

      <!-- Notification Cards Container -->
      <div id="notif-list" class="notif-list" tabindex="0" aria-live="polite"></div>
    </aside>
  `

  document.body.appendChild(root)

  bellBtn    = document.getElementById('notif-bell-btn')
  badgeEl    = document.getElementById('notif-badge')
  backdropEl = document.getElementById('notif-backdrop')
  drawerEl   = document.getElementById('notif-drawer')
  listEl     = document.getElementById('notif-list')

  const closeBtn    = document.getElementById('notif-close-btn')
  const markReadBtn = document.getElementById('notif-mark-read-btn')
  const clearBtn    = document.getElementById('notif-clear-btn')
  const tabs        = root.querySelectorAll('.notif-tab')

  // Listeners
  bellBtn.addEventListener('click', toggleDrawer)
  backdropEl.addEventListener('click', closeDrawer)
  closeBtn.addEventListener('click', closeDrawer)

  markReadBtn.addEventListener('click', () => {
    markAllRead()
  })

  clearBtn.addEventListener('click', () => {
    clearAll()
  })

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('notif-tab--active')
        t.setAttribute('aria-selected', 'false')
      })
      tab.classList.add('notif-tab--active')
      tab.setAttribute('aria-selected', 'true')
      activeFilter = tab.getAttribute('data-filter')
      renderList()
    })
  })

  // Keyboard accessibility
  window.addEventListener('keydown', (e) => {
    // Alt+N toggles drawer
    if (e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault()
      toggleDrawer()
      return
    }
    // Esc closes drawer if open
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault()
      closeDrawer()
    }
  })

  // Subscribe to changes
  onNotificationChange(() => {
    updateBadge()
    if (isOpen) {
      renderList()
    }
  })

  // Initial update
  updateBadge()
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationDrawer)
  } else {
    initNotificationDrawer()
  }
}
