import { requireAuth } from '../../lib/auth.js'
import { supabase } from '../../lib/supabase.js'
import { computeRemaining, formatTime, renderTimerElement, startCountdown } from '../../lib/timer.js'
import { soundHorn, beep } from '../../lib/audio.js'
import { toast } from '../../lib/toast.js'

// ── State ─────────────────────────────────────────────────────────────────────
let match        = null   // current matches row
let scores       = {}     // { red: { 1: N, 2: N, … }, blue: { … } }
let roundResults = []     // round_results rows
let stopTimer    = null   // cleanup function from startCountdown
let matchId      = null
let timerExpiredFired = false

// ── Auth + Init ───────────────────────────────────────────────────────────────
;(async () => {
  try {
    matchId = new URLSearchParams(location.search).get('id')
    if (!matchId) {
      showMissingMatch('No match ID provided in the URL.')
      return
    }

    const session = await requireAuth('/')
    if (!session) return

    // Set scoreboard link in bottom bar
    const sbLink = document.getElementById('scoreboard-link')
    if (sbLink) sbLink.href = `/pages/scoreboard/?id=${matchId}`

    const found = await loadMatch()
    if (!found) return

    await loadScoreEvents()
    subscribeRealtime()
    setupEventListeners()
    setupKeyboardShortcuts()
  } catch (err) {
    console.error('[control] init error:', err)
    toast('Error loading control panel: ' + (err.message || err), 'error')
  } finally {
    hideLoading()
  }
})()

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function loadMatch() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (error || !data) {
    showMissingMatch(error?.message || 'Match not found in database.')
    return false
  }

  match = data
  renderMatch()
  startTimerLoop()
  return true
}

async function loadScoreEvents() {
  const [eventsRes, resultsRes] = await Promise.all([
    supabase
      .from('score_events')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('round_results')
      .select('*')
      .eq('match_id', matchId)
      .order('round_number', { ascending: true })
  ])

  scores = computeScores(eventsRes.data || [])
  roundResults = resultsRes.data || []

  renderScores()
  renderRoundHistory()
  renderRoundWins()
}

function computeScores(events) {
  const s = { red: {}, blue: {} }
  for (const ev of events) {
    const rnd = ev.round_number
    s[ev.corner][rnd] = (s[ev.corner][rnd] || 0) + ev.points
  }
  return s
}

function totalScore(corner) {
  return Object.values(scores[corner] || {}).reduce((a, b) => a + b, 0)
}

function roundScore(corner, rnd) {
  return Math.max(0, scores[corner]?.[rnd] || 0)
}

// ── Realtime Subscription ─────────────────────────────────────────────────────
function subscribeRealtime() {
  supabase
    .channel(`control-${matchId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'matches',
      filter: `id=eq.${matchId}`
    }, async (payload) => {
      match = payload.new
      renderMatch()
      if (stopTimer) stopTimer()
      timerExpiredFired = false
      startTimerLoop()
      if (match.status === 'finished') showFinishedOverlay()
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'score_events',
      filter: `match_id=eq.${matchId}`
    }, async () => {
      await loadScoreEvents()
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'round_results',
      filter: `match_id=eq.${matchId}`
    }, async () => {
      await loadScoreEvents()
    })
    .subscribe()
}

// ── Timer Loop ────────────────────────────────────────────────────────────────
function startTimerLoop() {
  if (stopTimer) stopTimer()

  const timerEl = document.getElementById('timer') || document.getElementById('timer-digits')
  let lastUrgent = false

  stopTimer = startCountdown(
    () => match,
    (rem, isSecondBoundary) => {
      if (timerEl && isSecondBoundary) {
        renderTimerElement(timerEl, rem)
      }
      const isUrgent = rem <= 10000 && rem > 0
      if (timerEl && isUrgent !== lastUrgent) {
        timerEl.classList.toggle('timer-display--urgent', isUrgent)
        lastUrgent = isUrgent
      }
    },
    () => {
      if (timerEl) renderTimerElement(timerEl, 0)
      if (!timerExpiredFired) {
        timerExpiredFired = true
        soundHorn()
        toast('⏰ Time expired!', 'warning', 3000)
      }
    }
  )
}

// ── UI Rendering ──────────────────────────────────────────────────────────────
function renderMatch() {
  if (!match) return

  // Header
  const titleEl = document.getElementById('match-title')
  if (titleEl) titleEl.textContent = `${match.red_name} vs ${match.blue_name}`

  const subEl = document.getElementById('match-sub')
  if (subEl) {
    const meta = [
      match.match_code,
      match.division,
      match.gender,
      match.weight_class,
      `Round ${match.current_round} of ${match.total_rounds}`
    ].filter(Boolean).join(' · ')
    subEl.textContent = meta
  }

  // Status chip
  const chip = document.getElementById('status-chip')
  if (chip) {
    chip.className = `status-chip status-chip--${chipClass(match.status)}`
    chip.textContent = match.status.replace('_', ' ')
  }

  // Athletes
  const redNameEl = document.getElementById('red-name')
  if (redNameEl) redNameEl.textContent = match.red_name
  const redCountryEl = document.getElementById('red-country')
  if (redCountryEl) {
    if (match.red_country) {
      redCountryEl.textContent = match.red_country.toUpperCase()
      redCountryEl.style.display = 'inline-flex'
    } else {
      redCountryEl.style.display = 'none'
    }
  }

  const blueNameEl = document.getElementById('blue-name')
  if (blueNameEl) blueNameEl.textContent = match.blue_name
  const blueCountryEl = document.getElementById('blue-country')
  if (blueCountryEl) {
    if (match.blue_country) {
      blueCountryEl.textContent = match.blue_country.toUpperCase()
      blueCountryEl.style.display = 'inline-flex'
    } else {
      blueCountryEl.style.display = 'none'
    }
  }

  // Gam-jeom
  renderGjDots('red',  match.red_gam_jeom  ?? 0, 5)
  renderGjDots('blue', match.blue_gam_jeom ?? 0, 5)
  const redGjCount = document.getElementById('red-gj-count')
  if (redGjCount) redGjCount.textContent = match.red_gam_jeom ?? 0
  const blueGjCount = document.getElementById('blue-gj-count')
  if (blueGjCount) blueGjCount.textContent = match.blue_gam_jeom ?? 0

  // VR quotas
  const redVr = document.getElementById('red-vr-val')
  if (redVr) redVr.textContent = match.red_vr_quota ?? 1
  const blueVr = document.getElementById('blue-vr-val')
  if (blueVr) blueVr.textContent = match.blue_vr_quota ?? 1

  // Center column round badge
  const roundBadge = document.getElementById('round-badge')
  if (roundBadge) {
    roundBadge.textContent = `Round ${match.current_round ?? 1} / ${match.total_rounds ?? 3}`
  }

  // Timer controls active state
  const isRunning  = match.timer_status === 'running'
  const isFinished = match.status === 'finished'

  const startBtn = document.getElementById('start-btn')
  if (startBtn) startBtn.disabled = isRunning || isFinished

  const pauseBtn = document.getElementById('pause-btn')
  if (pauseBtn) pauseBtn.disabled = !isRunning || isFinished

  // Scoring buttons — disable when finished
  const allBtns = document.querySelectorAll('.score-btn, .gj-btn, #next-round-btn')
  allBtns.forEach(b => b.disabled = isFinished)

  if (isFinished) showFinishedOverlay()
}

function renderGjDots(corner, count, max) {
  const el = document.getElementById(`${corner}-gj-dots`)
  const show = Math.min(max, Math.max(count, 5))
  if (el.children.length !== show) {
    el.innerHTML = ''
    for (let i = 0; i < show; i++) {
      const d = document.createElement('div')
      d.className = 'gj-dot'
      el.appendChild(d)
    }
  }
  for (let i = 0; i < show; i++) {
    el.children[i].classList.toggle('gj-dot--filled', i < count)
  }
}

function renderScores() {
  if (!match) return
  const curRound = match.current_round ?? 1
  const redEl = document.getElementById('red-score')
  const blueEl = document.getElementById('blue-score')
  const rPts = String(roundScore('red', curRound))
  const bPts = String(roundScore('blue', curRound))

  if (redEl && redEl.textContent !== rPts) {
    redEl.textContent = rPts
    redEl.style.transform = 'scale(1.08)'
    setTimeout(() => { if (redEl) redEl.style.transform = 'scale(1)' }, 120)
  }
  if (blueEl && blueEl.textContent !== bPts) {
    blueEl.textContent = bPts
    blueEl.style.transform = 'scale(1.08)'
    setTimeout(() => { if (blueEl) blueEl.style.transform = 'scale(1)' }, 120)
  }
}

function renderRoundHistory() {
  if (!match) return
  for (const corner of ['red', 'blue']) {
    const el = document.getElementById(`${corner}-rounds`)
    el.innerHTML = ''
    for (const rr of roundResults) {
      const pts = rr[`${corner}_score`]
      const won = rr.winner === corner
      const span = document.createElement('span')
      span.style.cssText = `
        display:inline-block; padding:2px 8px;
        border-radius: 6px;
        font-size:0.75rem; font-weight:700;
        background: ${won ? (corner==='red'?'rgba(200,30,58,0.25)':'rgba(30,95,200,0.25)') : 'rgba(255,255,255,0.06)'};
        border: 1px solid ${won ? (corner==='red'?'rgba(200,30,58,0.5)':'rgba(30,95,200,0.5)') : 'rgba(255,255,255,0.1)'};
        color: ${won ? (corner==='red'?'#FF4D6A':'#5B9CF6') : 'var(--text-muted)'};
      `
      span.textContent = `R${rr.round_number}: ${pts} ${won ? '✓' : ''}`
      el.appendChild(span)
    }
    // Current round (live)
    if (match.status !== 'finished') {
      const cur = roundScore(corner, match.current_round)
      const span = document.createElement('span')
      span.style.cssText = `
        display:inline-block; padding:2px 8px;
        border-radius: 6px;
        font-size:0.75rem; font-weight:700;
        background: rgba(245,197,24,0.12);
        border: 1px solid rgba(245,197,24,0.3);
        color: var(--amber);
      `
      span.textContent = `R${match.current_round}: ${cur} ●`
      el.appendChild(span)
    }
  }
}

function renderRoundWins() {
  if (!match) return
  const redWins  = roundResults.filter(r => r.winner === 'red').length
  const blueWins = roundResults.filter(r => r.winner === 'blue').length
  const needed   = Math.ceil(match.total_rounds / 2)

  renderWinDots('red-wins-dots',  'red',  redWins,  needed)
  renderWinDots('blue-wins-dots', 'blue', blueWins, needed)
}

function renderWinDots(id, corner, wins, needed) {
  const el = document.getElementById(id)
  el.innerHTML = ''
  for (let i = 0; i < needed; i++) {
    const d = document.createElement('div')
    d.className = `round-win-dot round-win-dot--${corner}${i < wins ? ' won' : ''}`
    el.appendChild(d)
  }
}

function chipClass(status) {
  return { setup:'setup', live:'live', paused:'paused', round_break:'break', finished:'finished' }[status] || 'setup'
}

function showFinishedOverlay() {
  if (!match) return
  const redTotal  = totalScore('red')
  const blueTotal = totalScore('blue')
  const redWins   = roundResults.filter(r => r.winner === 'red').length
  const blueWins  = roundResults.filter(r => r.winner === 'blue').length

  let winnerText = ''
  if (redWins > blueWins)       winnerText = `🔴 ${match.red_name} wins match!`
  else if (blueWins > redWins)  winnerText = `🔵 ${match.blue_name} wins match!`
  else if (redTotal > blueTotal) winnerText = `🔴 ${match.red_name} wins on points!`
  else if (blueTotal > redTotal) winnerText = `🔵 ${match.blue_name} wins on points!`
  else                           winnerText = 'Draw!'

  document.getElementById('winner-text').textContent = winnerText
  document.getElementById('finished-overlay').style.display = 'flex'
}

function showMissingMatch(reason) {
  const container = document.querySelector('.score-area')
  if (container) {
    container.innerHTML = `
      <div class="glass" style="grid-column: 1 / -1; padding: var(--sp-8); text-align: center; max-width: 600px; margin: 40px auto;">
        <div style="font-size: 3rem; margin-bottom: var(--sp-4);">🥋</div>
        <h2 class="text-2xl font-bold" style="margin-bottom: var(--sp-2);">Active Match Not Found</h2>
        <p class="muted" style="margin-bottom: var(--sp-6); font-size: 0.95rem;">${reason}</p>
        <div style="display:flex; justify-content:center; gap: var(--sp-3);">
          <a href="/pages/setup/" class="clay clay--amber clay--lg" style="text-decoration:none;">Go to Match Setup →</a>
        </div>
      </div>
    `
  }
}

function hideLoading() {
  const el = document.getElementById('loading')
  if (el) {
    el.classList.add('loading-overlay--hidden')
    setTimeout(() => el.remove(), 300)
  }
}

// ── Action Dispatch (RPC) ─────────────────────────────────────────────────────
async function rpc(fn, params = {}) {
  const { error } = await supabase.rpc(fn, { p_match_id: matchId, ...params })
  if (error) toast(error.message, 'error')
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
  document.getElementById('start-btn').addEventListener('click', () => rpc('start_timer'))
  document.getElementById('pause-btn').addEventListener('click', () => rpc('pause_timer'))

  document.getElementById('horn-btn').addEventListener('click', () => {
    soundHorn()
    toast('🔔 Horn sounded!', 'info', 1000)
  })

  document.getElementById('next-round-btn').addEventListener('click', async () => {
    if (!match) return
    if (!confirm(`Close round ${match.current_round} and advance?`)) return
    await rpc('next_round')
    timerExpiredFired = false
  })

  document.getElementById('reset-btn').addEventListener('click', async () => {
    if (!confirm('Reset this match? All score events will be cleared.')) return
    await rpc('reset_match')
    await loadScoreEvents()
    document.getElementById('finished-overlay').style.display = 'none'
    timerExpiredFired = false
    toast('Match reset.', 'success')
  })

  document.getElementById('reset-from-finished').addEventListener('click', async () => {
    if (!confirm('Reset this match?')) return
    await rpc('reset_match')
    await loadScoreEvents()
    document.getElementById('finished-overlay').style.display = 'none'
    timerExpiredFired = false
  })

  // Scoring buttons (+1 to +5, -1)
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const corner = btn.dataset.corner
      const pts    = parseInt(btn.dataset.pts, 10)
      beep(corner === 'red' ? 660 : 520)
      await rpc('add_score', { p_corner: corner, p_points: pts })
    })
  })

  // Undo buttons
  document.getElementById('red-undo-btn')?.addEventListener('click', async () => {
    await rpc('undo_last_score', { p_corner: 'red' })
    toast('Red: last score undone.', 'info', 1500)
  })
  document.getElementById('blue-undo-btn')?.addEventListener('click', async () => {
    await rpc('undo_last_score', { p_corner: 'blue' })
    toast('Blue: last score undone.', 'info', 1500)
  })

  // Gam-jeom buttons
  document.getElementById('red-gj-btn').addEventListener('click', async () => {
    if (!confirm('Issue Gam-jeom penalty to Red corner?')) return
    await rpc('add_gam_jeom', { p_corner: 'red' })
  })
  document.getElementById('blue-gj-btn').addEventListener('click', async () => {
    if (!confirm('Issue Gam-jeom penalty to Blue corner?')) return
    await rpc('add_gam_jeom', { p_corner: 'blue' })
  })

  // Gam-jeom remove buttons
  document.getElementById('red-gj-minus-btn')?.addEventListener('click', async () => {
    await rpc('remove_gam_jeom', { p_corner: 'red' })
    toast('Red: 1 Gam-jeom removed.', 'info', 1500)
  })
  document.getElementById('blue-gj-minus-btn')?.addEventListener('click', async () => {
    await rpc('remove_gam_jeom', { p_corner: 'blue' })
    toast('Blue: 1 Gam-jeom removed.', 'info', 1500)
  })

  // VR buttons
  document.getElementById('red-vr-btn')?.addEventListener('click', async () => {
    await rpc('toggle_vr', { p_corner: 'red' })
  })
  document.getElementById('blue-vr-btn')?.addEventListener('click', async () => {
    await rpc('toggle_vr', { p_corner: 'blue' })
  })

  // Shortcuts modal toggle
  const modal = document.getElementById('shortcuts-modal')
  document.getElementById('shortcuts-btn')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex'
  })
  document.getElementById('close-shortcuts-btn')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none'
  })
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none'
  })
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Ignore keystrokes inside text inputs
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return

    const modal = document.getElementById('shortcuts-modal')
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      modal.style.display = 'none'
      return
    }

    if (e.code === 'Space') {
      e.preventDefault()
      if (match?.timer_status === 'running') {
        rpc('pause_timer')
      } else {
        rpc('start_timer')
      }
      return
    }

    if (e.key === 'h' || e.key === 'H') {
      soundHorn()
      toast('🔔 Horn sounded!', 'info', 1000)
      return
    }

    // Red scoring: 1..5, A (-1), Z (Gam-jeom), X (VR)
    if (['1','2','3','4','5'].includes(e.key)) {
      const pts = parseInt(e.key, 10)
      beep(660)
      rpc('add_score', { p_corner: 'red', p_points: pts })
      return
    }
    if (e.key === 'a' || e.key === 'A') {
      rpc('add_score', { p_corner: 'red', p_points: -1 })
      return
    }
    if (e.key === 'z' || e.key === 'Z') {
      rpc('add_gam_jeom', { p_corner: 'red' })
      return
    }
    if (e.key === 'x' || e.key === 'X') {
      rpc('toggle_vr', { p_corner: 'red' })
      return
    }

    // Blue scoring: 6..0 (6=1, 7=2, 8=3, 9=4, 0=5), L (-1), M (Gam-jeom), N (VR)
    const blueMap = { '6': 1, '7': 2, '8': 3, '9': 4, '0': 5 }
    if (blueMap[e.key]) {
      beep(520)
      rpc('add_score', { p_corner: 'blue', p_points: blueMap[e.key] })
      return
    }
    if (e.key === 'l' || e.key === 'L') {
      rpc('add_score', { p_corner: 'blue', p_points: -1 })
      return
    }
    if (e.key === 'm' || e.key === 'M') {
      rpc('add_gam_jeom', { p_corner: 'blue' })
      return
    }
    if (e.key === 'n' || e.key === 'N') {
      rpc('toggle_vr', { p_corner: 'blue' })
      return
    }
  })
}
