/**
 * Client-side timer that computes the live countdown from server state.
 *
 * The server stores:
 *   - timer_remaining_ms  (snapshot when last paused/set)
 *   - timer_started_at    (timestamp when timer started running, or null)
 *   - timer_status        ('idle' | 'running' | 'paused')
 *
 * Clients compute: remaining = timer_remaining_ms - (Date.now() - timer_started_at)
 * This eliminates network drift and server polling.
 */

/**
 * Compute the current remaining milliseconds from match state.
 * @param {{ timer_status, timer_remaining_ms, timer_started_at }} match
 * @returns {number}
 */
export function computeRemaining(match) {
  if (!match) return 0
  if (match.timer_status !== 'running') {
    return Math.max(0, match.timer_remaining_ms ?? 0)
  }
  const started = new Date(match.timer_started_at).getTime()
  const elapsed = Date.now() - started
  return Math.max(0, (match.timer_remaining_ms ?? 0) - elapsed)
}

/**
 * Format milliseconds as MM:SS
 * @param {number} ms
 * @returns {string}
 */
export function formatTime(ms) {
  const total  = Math.max(0, Math.ceil(ms / 1000))
  const mins   = Math.floor(total / 60)
  const secs   = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Render time into a timer element with fixed-width character slots.
 * Mutates only changed digit nodes in place, completely eliminating
 * font proportional width layout jitter and DOM re-creation thrashing.
 *
 * @param {HTMLElement} el
 * @param {number} ms
 */
export function renderTimerElement(el, ms) {
  if (!el) return
  const total  = Math.max(0, Math.ceil(ms / 1000))
  const mins   = Math.floor(total / 60)
  const secs   = total % 60
  const mStr   = String(mins).padStart(2, '0')
  const sStr   = String(secs).padStart(2, '0')

  let cache = el._timerDigits
  if (!cache || !cache.d0 || !cache.d1 || !cache.d2 || !cache.d3) {
    let d0 = el.querySelector('[data-td="m0"]')
    let d1 = el.querySelector('[data-td="m1"]')
    let d2 = el.querySelector('[data-td="s0"]')
    let d3 = el.querySelector('[data-td="s1"]')

    if (!d0 || !d1 || !d2 || !d3) {
      el.classList.add('timer-digits')
      el.innerHTML = `
        <span class="timer-digit" data-td="m0">${mStr[0]}</span><span class="timer-digit" data-td="m1">${mStr[1]}</span><span class="timer-colon">:</span><span class="timer-digit" data-td="s0">${sStr[0]}</span><span class="timer-digit" data-td="s1">${sStr[1]}</span>
      `
      d0 = el.querySelector('[data-td="m0"]')
      d1 = el.querySelector('[data-td="m1"]')
      d2 = el.querySelector('[data-td="s0"]')
      d3 = el.querySelector('[data-td="s1"]')
    }
    cache = el._timerDigits = { d0, d1, d2, d3 }
  }

  if (cache.d0 && cache.d0.textContent !== mStr[0]) cache.d0.textContent = mStr[0]
  if (cache.d1 && cache.d1.textContent !== mStr[1]) cache.d1.textContent = mStr[1]
  if (cache.d2 && cache.d2.textContent !== sStr[0]) cache.d2.textContent = sStr[0]
  if (cache.d3 && cache.d3.textContent !== sStr[1]) cache.d3.textContent = sStr[1]
}

/**
 * Render score into an element with fixed-width character slots.
 * Ensures numbers are centered and width is rigidly stable.
 *
 * @param {HTMLElement} el
 * @param {number|string} score
 */
export function renderScoreElement(el, score) {
  if (!el) return
  const str = String(score).padStart(2, '0')
  let cache = el._scoreDigits
  if (!cache || !cache.d0 || !cache.d1) {
    let d0 = el.querySelector('[data-sd="0"]')
    let d1 = el.querySelector('[data-sd="1"]')

    if (!d0 || !d1) {
      el.classList.add('score-digits')
      el.innerHTML = `
        <span class="score-digit" data-sd="0">${str[0]}</span><span class="score-digit" data-sd="1">${str[1]}</span>
      `
      d0 = el.querySelector('[data-sd="0"]')
      d1 = el.querySelector('[data-sd="1"]')
    }
    cache = el._scoreDigits = { d0, d1 }
  }

  if (cache.d0 && cache.d0.textContent !== str[0]) cache.d0.textContent = str[0]
  if (cache.d1 && cache.d1.textContent !== str[1]) cache.d1.textContent = str[1]
}

/**
 * Run a butter-smooth live countdown tick loop.
 * - Uses requestAnimationFrame for frame-perfect 60fps/120fps display updates with 0 jitter.
 * - Falls back to interval when tab is in background.
 * - Zero CPU cost when match is paused or idle.
 *
 * @param {() => object} getMatch Returns current match state
 * @param {(ms: number, secondChanged: boolean) => void} onTick
 * @param {() => void} onExpire Called once when timer hits 0 while running
 * @returns {() => void} Call to stop the timer loop
 */
export function startCountdown(getMatch, onTick, onExpire) {
  let expired = false
  let lastSecond = -1
  let rafId = null
  let intervalId = null
  let active = true

  const initialMatch = getMatch()
  const initialRemaining = computeRemaining(initialMatch)
  lastSecond = Math.ceil(initialRemaining / 1000)
  onTick(initialRemaining, true)

  // If timer is not running, no continuous loop is needed
  if (!initialMatch || initialMatch.timer_status !== 'running') {
    return () => {}
  }

  const checkTick = () => {
    if (!active) return
    const match = getMatch()
    if (!match || match.timer_status !== 'running') {
      stop()
      return
    }

    const remaining = computeRemaining(match)
    const curSecond = Math.ceil(remaining / 1000)
    const secondChanged = curSecond !== lastSecond

    if (secondChanged || remaining <= 0) {
      lastSecond = curSecond
      onTick(remaining, secondChanged)
    }

    if (remaining <= 0 && !expired) {
      expired = true
      stop()
      if (onExpire) onExpire()
      return
    }

    if (remaining > 1000) expired = false
  }

  const loop = () => {
    if (!active) return
    checkTick()
    rafId = requestAnimationFrame(loop)
  }

  rafId = requestAnimationFrame(loop)
  // Low-frequency heartbeat interval as backup when tab is backgrounded
  intervalId = setInterval(checkTick, 250)

  const stop = () => {
    active = false
    if (rafId) cancelAnimationFrame(rafId)
    if (intervalId) clearInterval(intervalId)
  }

  return stop
}
