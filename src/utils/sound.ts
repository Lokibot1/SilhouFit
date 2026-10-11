let ctx: AudioContext | undefined

/** A short, soft two-note "ding" for a confirmed add to cart. Silent wherever Web Audio is missing or blocked. */
export function playAddToCart() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    const start = ctx.currentTime
    for (const [i, freq] of [660, 990].entries()) {
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
    // Sound is a nicety; never let it break the add.
  }
}
