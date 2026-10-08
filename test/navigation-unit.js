import assert from 'node:assert/strict'
import { Navigation } from '../src/navigation.js'

let page, hidden = 0, starts = []
let context = { kind: 'puzzles', label: 'Puzzle', progress: true, username: 'me' }
let settings = { height: 0, scale: 1, environment: 'study', level: 3, time: 10, increment: 5,
  color: 'random', rated: false, maia: 5, pdiff: 'normal', ptheme: 'mix', hands: 'grab',
  voice: 'off', boardTheme: 'walnut', pieceTheme: 'antique', pieces: 'solid' }
const nav = new Navigation({
  show: p => { page = p }, hide: () => hidden++, context: () => context,
  get: () => settings, set: p => { Object.assign(settings, p); nav.refresh() },
  start: kind => starts.push(kind), login() {}, cancelSeek() {}
})
const press = label => {
  const action = page.actions.find(a => a.label === label)
  assert.ok(action, `Missing ${label} on ${page.title}`)
  assert.ok(!action.disabled, `${label} is disabled`)
  action.run()
}
nav.open()
press('Settings'); press('Comfort')
assert.equal(page.path, 'Menu / Settings')
page.back.run()
assert.equal(page.title, 'Settings')
press('Comfort'); page.returnAction.run()
assert.equal(hidden, 1)
assert.deepEqual(starts, [], 'browsing settings never replaces the activity')
nav.open(); press('Train'); press('Coordinates')
assert.equal(page.title, 'Switch activity?')
page.back.run()
assert.equal(page.title, 'Train')
press('Coordinates'); press('Start coordinates')
assert.deepEqual(starts, ['coordinates'])
context = { kind: 'game', label: 'Game', live: true, progress: true, username: 'me' }
nav.open()
assert.ok(page.actions.find(a => a.label === 'Play').disabled)
press('Settings'); press('Appearance'); press('Scene'); press('Night')
assert.equal(settings.environment, 'night')
assert.ok(page.actions.find(a => a.label === 'Night').selected)
assert.equal(page.returnAction.label, 'Return to game')
context = { ...context, live: false, progress: false, label: 'Game review' }
nav.refresh()
assert.equal(page.title, 'Scene', 'activity updates do not replace the menu route')
page.returnAction.run()
nav.open(); press('Play'); press('Stockfish'); press('Level'); press('2')
assert.equal(settings.level, 2, 'difficulty is selected directly, including decreasing it')
page.back.run()
assert.equal(page.title, 'Stockfish')
console.log('NAVIGATION-UNIT-OK')
