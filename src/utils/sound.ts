let ctx: AudioContext | undefined

/** Plays one soft sine note per frequency, 70 ms apart. `needsRunning` skips it while the browser still blocks audio (no gesture yet). Silent wherever Web Audio is missing or blocked. */
function chime(freqs: number[], needsRunning: boolean) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    if (needsRunning && ctx.state !== 'running') return
    const start = ctx.currentTime
    for (const [i, freq] of freqs.entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const at = start + i * 0.07
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.14)
    }
  } catch {
    // Sound is a nicety; never let it break the caller.
  }
}

/** A short, soft two-note "ding" for a confirmed add to cart. */
export function playAddToCart() {
  chime([660, 990], false)
}

/** A short, soft falling two-note chime for a new notification. Skipped until the browser allows audio. */
export function playNotification() {
  chime([880, 660], true)
}
