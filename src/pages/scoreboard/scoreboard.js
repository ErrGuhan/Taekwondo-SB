// Scoreboard — public venue display, no auth required
import { supabase } from '../../lib/supabase.js'
import { computeRemaining, formatTime, renderTimerElement, renderScoreElement, startCountdown } from '../../lib/timer.js'

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
    hideLoading()
    return
  }

  try {
    await loadAll()
    subscribeRealtime()
  } catch (err) {
    console.error('[scoreboard] init error:', err)
    showWaitingScreen(err.message || 'Error loading scoreboard data.')
  } finally {
    hideLoading()
  }
})()

// ── Data Loading ──────────────────────────────────────────────────────────────
async function loadAll() {
  const found = await loadMatch()
  if (!found) return
  await loadScoreData()
}

async function loadMatch() {
  if (matchId === 'demo') {
    match = {
      id: 'demo',
      match_code: 'MAT-1 · Senior M-68kg',
      division: 'Senior',
      gender: 'Male',
      weight_class: '-68kg',
      round_seconds: 120,
      total_rounds: 3,
      red_name: 'KIM Tae-Hun',
      red_country: 'KOR',
      blue_name: 'LOPEZ Steven',
      blue_country: 'USA',
      status: 'live',
      current_round: 1,
      timer_status: 'idle',
      timer_remaining_ms: 120000,
      timer_started_at: null,
      red_gam_jeom: 0,
      blue_gam_jeom: 0,
      red_vr_quota: 1,
      blue_vr_quota: 1,
      operator_id: 'demo-operator-id',
      created_at: new Date().toISOString()
    }
    hideWaitingScreen()
    renderAll()
    startTimerLoop()
    return true
  }

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
  if (matchId === 'demo') {
    scoreEvents  = []
    roundResults = []
    renderScores()
    renderRoundChips()
    return
  }

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
  if (matchId === 'demo') return
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
      if (timerEl && isSecondBoundary) {
        renderTimerElement(timerEl, rem)
      }
      const isUrgent = rem <= 10000 && rem > 0
      if (timerEl && isUrgent !== lastUrgent) {
        timerEl.classList.toggle('sb-timer--urgent', isUrgent)
        lastUrgent = isUrgent
      }
    },
    () => {
      if (timerEl) renderTimerElement(timerEl, 0)
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
  const redName = document.getElementById('sb-red-name')
  if (redName) redName.textContent = match.red_name || 'Hong'

  const redCountry = document.getElementById('sb-red-country')
  if (redCountry) {
    if (match.red_country) {
      redCountry.textContent = match.red_country.toUpperCase()
      redCountry.style.display = 'inline-flex'
    } else {
      redCountry.style.display = 'none'
    }
  }

  const blueName = document.getElementById('sb-blue-name')
  if (blueName) blueName.textContent = match.blue_name || 'Chung'

  const blueCountry = document.getElementById('sb-blue-country')
  if (blueCountry) {
    if (match.blue_country) {
      blueCountry.textContent = match.blue_country.toUpperCase()
      blueCountry.style.display = 'inline-flex'
    } else {
      blueCountry.style.display = 'none'
    }
  }

  const matchCode = document.getElementById('sb-match-code')
  if (matchCode) matchCode.textContent = match.match_code || 'MATCH'

  const curRound = document.getElementById('sb-cur-round')
  if (curRound) curRound.textContent = match.current_round ?? 1

  const totalRounds = document.getElementById('sb-total-rounds')
  if (totalRounds) totalRounds.textContent = match.total_rounds ?? 3

  const meta = [match.division, match.gender, match.weight_class].filter(Boolean).join(' · ')
  const eventSub = document.getElementById('sb-event-sub')
  if (eventSub) eventSub.textContent = meta || 'WT Taekwondo Scoring'
}

function renderScores() {
  const curRound = match?.current_round ?? 1
  const redPts   = getRoundPoints('red', curRound)
  const bluePts  = getRoundPoints('blue', curRound)

  const redEl  = document.getElementById('sb-red-score')
  const blueEl = document.getElementById('sb-blue-score')

  if (!redEl || !blueEl) return

  const prevRed  = redEl.dataset.pts
  const prevBlue = blueEl.dataset.pts

  renderScoreElement(redEl, redPts)
  renderScoreElement(blueEl, bluePts)

  redEl.dataset.pts  = String(redPts)
  blueEl.dataset.pts = String(bluePts)

  if (prevRed !== undefined && prevRed !== String(redPts)) animateScore(redEl)
  if (prevBlue !== undefined && prevBlue !== String(bluePts)) animateScore(blueEl)
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
  const redGj = document.getElementById('sb-red-gj-count')
  if (redGj) redGj.textContent = match.red_gam_jeom ?? 0

  const blueGj = document.getElementById('sb-blue-gj-count')
  if (blueGj) blueGj.textContent = match.blue_gam_jeom ?? 0
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
    if (!chip) continue
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

  if (!pill || !text || !dot) return

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

function hideLoading() {
  const el = document.getElementById('loading')
  if (el) {
    el.classList.add('loading-overlay--hidden')
    setTimeout(() => el.remove(), 300)
  }
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
