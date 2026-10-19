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
 * Run an optimized live countdown tick loop.
 * - If match is paused or idle: runs onTick ONCE and stops (0 CPU/main-thread cost).
 * - If running: ticks only as needed (~100ms) with state-change optimization.
 *
 * @param {() => object}         getMatch  Returns current match state
 * @param {(ms: number, secondChanged: boolean) => void} onTick
 * @param {() => void}           onExpire  Called once when timer hits 0 while running
 * @returns {() => void}  Call to stop the interval
 */
export function startCountdown(getMatch, onTick, onExpire) {
  let expired = false
  let lastSecond = -1

  const initialMatch = getMatch()
  const initialRemaining = computeRemaining(initialMatch)
  lastSecond = Math.ceil(initialRemaining / 1000)
  onTick(initialRemaining, true)

  // If timer is not running, no interval is needed!
  if (!initialMatch || initialMatch.timer_status !== 'running') {
    return () => {}
  }

  const id = setInterval(() => {
    const match = getMatch()
    if (!match || match.timer_status !== 'running') {
      clearInterval(id)
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
      clearInterval(id)
      if (onExpire) onExpire()
    }

    if (remaining > 1000) expired = false
  }, 100)

  return () => clearInterval(id)
}
