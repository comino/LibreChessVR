// Synthesized sound cues (no audio files) and controller haptics.

let ctx = null

// kind -> [[frequency Hz, duration s], ...] played in sequence
const CUES = {
  error: [[150, 0.2]],
  success: [[660, 0.1], [880, 0.16]],
  start: [[440, 0.08], [660, 0.12]]
}

let noise = null

// Wooden "clack": a short band-passed noise burst (piece on board), lower for captures.
function clack(t, freq, gain) {
  noise ??= (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length / 6))
    return b
  })()
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
  src.buffer = noise
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 3
  g.gain.value = gain
  src.connect(bp).connect(g).connect(ctx.destination)
  src.start(t)
}

export function playCue(kind) {
  try {
    ctx ??= new AudioContext()
    ctx.resume()
  } catch { return } // no audio available
  if (kind === 'move') return clack(ctx.currentTime, 1600, 1.2)
  if (kind === 'pick') return clack(ctx.currentTime, 2600, 0.45) // light tick: piece lifted
  if (kind === 'capture') {
    clack(ctx.currentTime, 1200, 1.4)
    return clack(ctx.currentTime + 0.07, 900, 1.1)
  }
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
