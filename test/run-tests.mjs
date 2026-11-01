// Runs test files (default: every unit suite and smoke page), prints each result line and writes
// test-results/junit.xml with one case per file for bx. Exit 1 unless every file passed.
// Usage: node test/run-tests.mjs [test/x-unit.js | test/x-smoke.html ...]
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const list = suffix => readdirSync('test').filter(f => f.endsWith(suffix)).sort().map(f => 'test/' + f)
const UNIT = ['test/test.js', ...list('-unit.js')]
const SMOKE = ['test/smoke.html', ...list('-smoke.html')]
const OK = /^[A-Z-]+-OK(\s|$)/
const files = process.argv.length > 2 ? process.argv.slice(2) : [...UNIT, ...SMOKE]
const results = []

function runUnit(file) {
  const t0 = Date.now()
  const r = spawnSync('node', [file], { encoding: 'utf8' })
  process.stdout.write(r.stdout); process.stderr.write(r.stderr)
  const last = (r.stdout + r.stderr).trim().split('\n').at(-1) || ''
  results.push({ file, ok: r.status === 0, message: r.status === 0 ? '' : `exit ${r.status}: ${last}`, secs: (Date.now() - t0) / 1000 })
}

function runSmoke(pages) {
  const t0 = Date.now()
  const r = spawnSync('test/run-smoke.sh', pages, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  process.stdout.write(r.stdout)
  const lines = new Map(r.stdout.split('\n').map(l => l.match(/^(test\/\S+\.html): (.*)$/)).filter(Boolean).map(m => [m[1], m[2]]))
  const secs = (Date.now() - t0) / 1000 / pages.length
  for (const file of pages) {
    const out = lines.get(file)
    results.push({ file, ok: OK.test(out ?? ''), message: OK.test(out ?? '') ? '' : out ?? `no result (run-smoke exit ${r.status})`, secs })
  }
}

const esc = s => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])
function writeJunit() {
  const cases = results.map(({ file, ok, message, secs }) =>
    `  <testcase classname="${esc(file)}" name="${esc(file)}" file="${esc(file)}" time="${secs.toFixed(1)}">` +
    (ok ? '' : `<failure message="${esc(message.slice(0, 500))}"/>`) + '</testcase>')
  const failures = results.filter(r => !r.ok).length
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/junit.xml', `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuite name="LibreChessVR" tests="${results.length}" failures="${failures}">\n${cases.join('\n')}\n</testsuite>\n`)
}

const unknown = files.filter(f => !f.endsWith('.js') && !f.endsWith('.html'))
if (unknown.length) { console.error('run-tests: not a test file: ' + unknown.join(' ')); process.exit(2) }
files.filter(f => f.endsWith('.js')).forEach(runUnit)
const pages = files.filter(f => f.endsWith('.html'))
if (pages.length) runSmoke(pages)
writeJunit()
process.exit(results.every(r => r.ok) ? 0 : 1)
