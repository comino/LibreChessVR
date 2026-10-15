// Both desktop and in-scene clocks count from the same server snapshot.
export const LOW_TIME = 20000

export function clockTime(status, color, now = performance.now()) {
  const time = color === 'w' ? status.wtime : status.btime
  const elapsed = status.running && status.turn === color ? Math.max(0, now - status.ts) : 0
  return Math.max(0, time - elapsed)
}

export function formatClock(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

export function clockState(status, color, now = performance.now()) {
  const time = clockTime(status, color, now)
  return { time, text: formatClock(time), active: !!status.running && status.turn === color, low: time < LOW_TIME }
}
