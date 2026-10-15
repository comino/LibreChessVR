import assert from 'node:assert/strict'
import { clockTime, clockState, formatClock } from '../src/clock.js'

const state = { wtime: 60000, btime: 45000, ts: 0, turn: 'w', running: true }
assert.equal(clockTime(state, 'w', 2500), 57500)
assert.equal(clockTime(state, 'b', 2500), 45000)
assert.equal(clockTime({ ...state, running: false }, 'w', 2500), 60000)
assert.equal(clockTime(state, 'w', 90000), 0)
assert.equal(clockTime({ ...state, ts: 1000 }, 'w', 900), 60000)
assert.equal(clockTime({ ...state, wtime: 65000, ts: 3000 }, 'w', 4000), 64000, 'server update includes increment')
assert.equal(clockTime({ ...state, turn: 'b' }, 'w', 4000), 60000, 'inactive side stops counting')
assert.deepEqual(clockState({ ...state, wtime: 20000 }, 'w', 1), { time: 19999, text: '0:20', active: true, low: true })
assert.equal(clockState({ ...state, wtime: 20000 }, 'w', 0).low, false)
assert.equal(formatClock(60000), '1:00')
assert.equal(formatClock(59001), '1:00')
assert.equal(formatClock(59000), '0:59')
assert.equal(formatClock(1), '0:01')
assert.equal(formatClock(-1), '0:00')
assert.equal(formatClock(3600000), '60:00')
console.log('CLOCK-OK')
