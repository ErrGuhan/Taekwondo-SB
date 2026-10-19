/**
 * Sound the end-of-round horn using the Web Audio API.
 * No audio files needed — pure synthesis.
 *
 * @param {number} durationMs  Total duration in milliseconds (default 1400)
 */
export function soundHorn(durationMs = 1400) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    // Two oscillators layered for a richer "buzzer" texture
    const layers = [
      { freq: 440, type: 'square', gainVal: 0.20 },
      { freq: 880, type: 'square', gainVal: 0.08 },
    ]

    const dur = durationMs / 1000

    layers.forEach(({ freq, type, gainVal }) => {
      const osc  = ctx.createOscillator()
      const gn   = ctx.createGain()

      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime)

      // Amplitude envelope: sharp attack, slow decay
      gn.gain.setValueAtTime(0, ctx.currentTime)
      gn.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + 0.015)
      gn.gain.setValueAtTime(gainVal, ctx.currentTime + dur * 0.7)
      gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)

      osc.connect(gn)
      gn.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + dur)
    })
  } catch (err) {
    console.warn('[audio] Web Audio API not available:', err.message)
  }
}

/**
 * Short single beep (for button feedback, countdown warnings).
 */
export function beep(freq = 880, durationMs = 80) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gn  = ctx.createGain()
    osc.connect(gn)
    gn.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gn.gain.setValueAtTime(0.15, ctx.currentTime)
    gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
    osc.start()
    osc.stop(ctx.currentTime + durationMs / 1000)
  } catch {}
}
