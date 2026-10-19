import { requireAuth, signOut } from '../../lib/auth.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../../lib/toast.js'

// ── Auth guard ────────────────────────────────────────────────────────────────
let session = null
;(async () => {
  session = await requireAuth('/')
  if (!session) return
  document.getElementById('user-email').textContent = session.user.email
  await loadRecentMatches()
})()

document.getElementById('sign-out-btn').addEventListener('click', () => signOut('/'))

// ── Form submission ───────────────────────────────────────────────────────────
const form    = document.getElementById('setup-form')
const errEl   = document.getElementById('form-error')
const initBtn = document.getElementById('init-btn')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearError()

  const redName  = document.getElementById('red-name').value.trim()
  const blueName = document.getElementById('blue-name').value.trim()

  if (!redName || !blueName) {
    showError('Both athlete names are required.')
    return
  }

  const payload = {
    match_code:    document.getElementById('match-code').value.trim() || null,
    division:      document.getElementById('division').value || null,
    gender:        document.getElementById('gender').value || null,
    weight_class:  document.getElementById('weight-class').value.trim() || null,
    total_rounds:  parseInt(document.getElementById('total-rounds').value, 10),
    round_seconds: parseInt(document.getElementById('round-seconds').value, 10),
    red_name:      redName,
    red_country:   document.getElementById('red-country').value.trim().toUpperCase() || null,
    blue_name:     blueName,
    blue_country:  document.getElementById('blue-country').value.trim().toUpperCase() || null,
    operator_id:   session?.user?.id || 'demo-operator-id',
    timer_remaining_ms: parseInt(document.getElementById('round-seconds').value, 10) * 1000,
  }

  initBtn.disabled = true
  initBtn.textContent = 'Creating match…'

  const res = await supabase.from('matches').insert(payload).select().single()
  const data = res.data
  const error = res.error

  initBtn.disabled = false
  initBtn.textContent = '⚡ Initialize Match'

  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
      showError('Database schema not found. Please run sql/schema.sql in your Supabase SQL Editor.')
    } else {
      showError(error.message)
    }
    return
  }

  showLinks(data)
})

// ── Show generated links ──────────────────────────────────────────────────────
function showLinks(match) {
  const base = window.location.origin

  const controlUrl    = `${base}/pages/control/?id=${match.id}`
  const scoreboardUrl = `${base}/pages/scoreboard/?id=${match.id}`

  document.getElementById('control-link').value    = controlUrl
  document.getElementById('scoreboard-link').value = scoreboardUrl
  document.getElementById('open-control').href     = controlUrl
  document.getElementById('open-scoreboard').href  = scoreboardUrl

  const meta = [
    match.match_code,
    match.division,
    match.weight_class,
    `${match.total_rounds} rounds × ${formatDuration(match.round_seconds)}`
  ].filter(Boolean).join(' · ')
  document.getElementById('match-meta').textContent =
    `${match.red_name} vs ${match.blue_name}` + (meta ? ` — ${meta}` : '')

  document.getElementById('form-section').style.display  = 'none'
  document.getElementById('links-section').style.display = 'block'

  toast('Match created!', 'success')
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60), s = secs % 60
  return m + ':' + String(s).padStart(2, '0')
}

// ── Copy buttons ──────────────────────────────────────────────────────────────
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label} copied!`, 'success', 1500)
  } catch {
    toast('Copy failed — select and copy manually.', 'error')
  }
}

document.getElementById('copy-control').addEventListener('click', () =>
  copyToClipboard(document.getElementById('control-link').value, 'Control link'))

document.getElementById('copy-scoreboard').addEventListener('click', () =>
  copyToClipboard(document.getElementById('scoreboard-link').value, 'Scoreboard link'))

// ── New Match ─────────────────────────────────────────────────────────────────
document.getElementById('new-match-btn').addEventListener('click', () => {
  document.getElementById('setup-form').reset()
  document.getElementById('form-section').style.display  = 'block'
  document.getElementById('links-section').style.display = 'none'
  loadRecentMatches()
})

// ── Recent matches list ───────────────────────────────────────────────────────
async function loadRecentMatches() {
  if (!session?.user?.id || session.user.id === 'demo-operator-id') return

  const res = await supabase
    .from('matches')
    .select('id, match_code, red_name, blue_name, status, created_at')
    .eq('operator_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const data = res.data || []
  if (!data?.length) return

  const container = document.getElementById('matches-list')
  container.innerHTML = `
    <h3 class="text-sm uppercase font-bold muted" style="margin-bottom: var(--sp-3);">Recent Matches</h3>
    <div style="display:flex; flex-direction:column; gap: var(--sp-2);">
      ${data.map(m => `
        <div class="glass glass--sm" style="padding: var(--sp-3) var(--sp-4); display:flex; align-items:center; gap: var(--sp-4);">
          <span class="status-chip status-chip--${esc(m.status || 'setup')}">${esc(m.status || 'setup')}</span>
          <div style="flex:1;">
            <div class="text-sm font-bold">${esc(m.red_name)} vs ${esc(m.blue_name)}</div>
            <div class="text-xs muted">${esc(m.match_code || '')} · ${m.created_at ? new Date(m.created_at).toLocaleString() : 'Ready'}</div>
          </div>
          <div style="display:flex; gap: var(--sp-2);">
            <a href="/pages/control/?id=${encodeURIComponent(m.id)}" class="clay clay--ghost clay--sm">Control</a>
            <a href="/pages/scoreboard/?id=${encodeURIComponent(m.id)}" class="clay clay--blue clay--sm">Board</a>
          </div>
        </div>
      `).join('')}
    </div>
  `
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) {
  errEl.textContent = msg
  errEl.style.display = 'block'
}
function clearError() {
  errEl.style.display = 'none'
}
function esc(str) {
  return String(str).replace(/[<>"'&]/g, c =>
    ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]))
}
