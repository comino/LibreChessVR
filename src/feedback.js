// Synthesized sound cues (no audio files) and controller haptics.

let ctx = null

// kind -> [[frequency Hz, duration s], ...] played in sequence
const CUES = {
  move: [[520, 0.05]],
  capture: [[420, 0.05], [260, 0.08]],
  error: [[150, 0.2]],
  success: [[660, 0.1], [880, 0.16]],
  start: [[440, 0.08], [660, 0.12]]
}

export function playCue(kind) {
  try {
    ctx ??= new AudioContext()
    ctx.resume()
  } catch { return } // no audio available
  let t = ctx.currentTime
  for (const [freq, dur] of CUES[kind]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.type = kind === 'error' ? 'square' : 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
    t += dur
  }
}

// source: XRInputSource of a controller (tracked hands have no actuator).
export function buzz(source, intensity = 0.4, ms = 25) {
  source?.gamepad?.hapticActuators?.[0]?.pulse?.(intensity, ms)
}
