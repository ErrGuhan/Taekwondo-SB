// Scoreboard — public venue display, no auth required
import { supabase } from '../../lib/supabase.js'
import { computeRemaining, formatTime, startCountdown } from '../../lib/timer.js'

// ── State ─────────────────────────────────────────────────────────────────────
let match        = null
let scoreEvents  = []
let roundResults = []
let stopTimer    = null
const matchId    = new URLSearchParams(location.search).get('id')

// ── Init ──────────────────────────────────────────────────────────────────────
;(async () => {
  setupFullscreenToggle()

  if (!matchId) {
    showWaitingScreen('No match ID specified in URL. Please open a valid scoreboard link.')
    return
  }

  await loadAll()
  subscribeRealtime()
})()

// ── Data Loading ──────────────────────────────────────────────────────────────
async function loadAll() {
  const found = await loadMatch()
  if (!found) return
  await loadScoreData()
}

async function loadMatch() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (error || !data) {
    showWaitingScreen(error?.message || 'Match not found. Waiting for operator…')
    return false
  }

  hideWaitingScreen()
  match = data
  renderAll()
  startTimerLoop()
  return true
}

async function loadScoreData() {
  const [evRes, rrRes] = await Promise.all([
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

  scoreEvents  = evRes.data  || []
  roundResults = rrRes.data  || []

  renderScores()
  renderRoundChips()
}

// ── Realtime Subscription ─────────────────────────────────────────────────────
function subscribeRealtime() {
  supabase
    .channel(`scoreboard-${matchId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'matches',
      filter: `id=eq.${matchId}`
    }, async (payload) => {
      match = payload.new
      hideWaitingScreen()
      if (stopTimer) stopTimer()
      startTimerLoop()
      renderAll()
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'score_events',
      filter: `match_id=eq.${matchId}`
    }, async () => {
      const { data } = await supabase
        .from('score_events')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true })
      scoreEvents = data || []
      renderScores()
      renderRoundChips()
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'round_results',
      filter: `match_id=eq.${matchId}`
    }, async () => {
      const { data } = await supabase
        .from('round_results')
        .select('*')
        .eq('match_id', matchId)
        .order('round_number', { ascending: true })
      roundResults = data || []
      renderRoundChips()
    })
    .subscribe()
}

// ── Timer Loop ────────────────────────────────────────────────────────────────
function startTimerLoop() {
  if (stopTimer) stopTimer()

  const timerEl = document.getElementById('sb-timer')
  let lastUrgent = false

  stopTimer = startCountdown(
    () => match,
    (rem, isSecondBoundary) => {
      if (isSecondBoundary) {
        timerEl.textContent = formatTime(rem)
      }
      const isUrgent = rem <= 10000 && rem > 0
      if (isUrgent !== lastUrgent) {
        timerEl.classList.toggle('sb-timer--urgent', isUrgent)
        lastUrgent = isUrgent
      }
    },
    () => {
      timerEl.textContent = '00:00'
    }
  )
}

// ── UI Rendering ──────────────────────────────────────────────────────────────
function renderAll() {
  if (!match) return
  renderMetadata()
  renderScores()
  renderStatus()
  renderGamJeom()
  renderBadges()
  renderRoundChips()
}

function renderMetadata() {
  document.getElementById('sb-red-name').textContent     = match.red_name || 'Hong'
  document.getElementById('sb-red-country').textContent  = match.red_country ? match.red_country : ''

  document.getElementById('sb-blue-name').textContent    = match.blue_name || 'Chung'
  document.getElementById('sb-blue-country').textContent = match.blue_country ? match.blue_country : ''

  document.getElementById('sb-match-code').textContent   = match.match_code || 'MATCH'

  document.getElementById('sb-cur-round').textContent    = match.current_round ?? 1
  document.getElementById('sb-total-rounds').textContent  = match.total_rounds ?? 3

  const meta = [match.division, match.gender, match.weight_class].filter(Boolean).join(' · ')
  document.getElementById('sb-event-sub').textContent    = meta || 'WT Taekwondo Scoring'
}

function renderScores() {
  const curRound = match?.current_round ?? 1
  const redPts   = getRoundPoints('red', curRound)
  const bluePts  = getRoundPoints('blue', curRound)

  const redEl  = document.getElementById('sb-red-score')
  const blueEl = document.getElementById('sb-blue-score')

  const prevRed  = redEl.textContent
  const prevBlue = blueEl.textContent

  const newRed  = String(redPts).padStart(2, '0')
  const newBlue = String(bluePts).padStart(2, '0')

  redEl.textContent  = newRed
  blueEl.textContent = newBlue

  if (prevRed !== newRed)  animateScore(redEl)
  if (prevBlue !== newBlue) animateScore(blueEl)
}

function getRoundPoints(corner, roundNum) {
  const pts = scoreEvents
    .filter(e => e.corner === corner && e.round_number === roundNum)
    .reduce((sum, e) => sum + e.points, 0)
  return Math.max(0, pts)
}

function animateScore(el) {
  if (!el) return
  el.style.transform = 'scale(1.08)'
  setTimeout(() => { el.style.transform = 'scale(1)' }, 160)
}

function renderGamJeom() {
  if (!match) return
  document.getElementById('sb-red-gj-count').textContent  = match.red_gam_jeom ?? 0
  document.getElementById('sb-blue-gj-count').textContent = match.blue_gam_jeom ?? 0
}

function renderBadges() {
  if (!match) return
  const redVr  = document.getElementById('sb-red-vr')
  const blueVr = document.getElementById('sb-blue-vr')

  if (redVr) {
    redVr.classList.toggle('sb-badge--used', (match.red_vr_quota ?? 1) <= 0)
  }
  if (blueVr) {
    blueVr.classList.toggle('sb-badge--used', (match.blue_vr_quota ?? 1) <= 0)
  }
}

function renderRoundChips() {
  if (!match) return
  const totalRounds = match.total_rounds || 3
  const curRound    = match.current_round || 1

  renderCornerChips('sb-red-rounds',  'red',  totalRounds, curRound)
  renderCornerChips('sb-blue-rounds', 'blue', totalRounds, curRound)
}

function renderCornerChips(containerId, corner, total, curRound) {
  const container = document.getElementById(containerId)
  if (!container) return

  // Re-create only if total rounds changed
  if (container.children.length !== total) {
    container.innerHTML = ''
    for (let r = 1; r <= total; r++) {
      const chip = document.createElement('span')
      chip.className = 'sb-chip'
      chip.dataset.round = r
      container.appendChild(chip)
    }
  }

  for (let r = 1; r <= total; r++) {
    const chip = container.children[r - 1]
    const rr = roundResults.find(res => res.round_number === r)

    chip.classList.toggle('sb-chip--active', r === curRound && match.status !== 'finished')
    chip.classList.toggle('sb-chip--won', rr?.winner === corner)

    if (rr) {
      const pts = rr[`${corner}_score`] ?? 0
      chip.textContent = `R${r} (${pts})`
    } else {
      chip.textContent = `R${r}`
    }
  }
}

function renderStatus() {
  if (!match) return
  const pill = document.getElementById('sb-status-pill')
  const text = document.getElementById('sb-status-text')
  const dot  = document.getElementById('sb-status-dot')

  const s = match.status || 'setup'
  pill.className = `sb-status-pill sb-status-pill--${s}`

  const labels = {
    setup:       'SETUP',
    live:        'LIVE',
    paused:      'PAUSED',
    round_break: 'ROUND BREAK',
    finished:    'FINAL DECISION',
  }
  text.textContent = labels[s] || s.toUpperCase()

  dot.style.display = (s === 'setup' || s === 'finished') ? 'none' : 'inline-block'
}

// ── Screen States ─────────────────────────────────────────────────────────────
function showWaitingScreen(message) {
  const overlay = document.getElementById('waiting-overlay')
  const sub = document.getElementById('waiting-sub')
  if (overlay) {
    if (sub && message) sub.textContent = message
    overlay.style.display = 'flex'
  }
}

function hideWaitingScreen() {
  const overlay = document.getElementById('waiting-overlay')
  if (overlay) overlay.style.display = 'none'
}

// ── Fullscreen Toggle ─────────────────────────────────────────────────────────
function setupFullscreenToggle() {
  const btn = document.getElementById('fullscreen-btn')
  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      if (btn) btn.innerHTML = '<span>⤓</span> Exit Fullscreen'
    } else {
      document.exitFullscreen().catch(() => {})
      if (btn) btn.innerHTML = '<span>⛶</span> Fullscreen'
    }
  }

  btn?.addEventListener('click', toggle)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        toggle()
      }
    }
  })
}
