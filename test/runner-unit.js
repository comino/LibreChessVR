// test/run-tests.mjs classifies each file for bx red: an assertion is a junit <failure>, a suite that
// cannot run is an <error> (never red), and paths are reported as given in canonical form. PRJ-50.
import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const JUNIT = 'test-results/junit.xml'
const env = { ...process.env, SMOKE_RUNNER: 'test/fixtures/fake-smoke.mjs' }  // pages without Chrome
const run = (...files) => {
  const r = spawnSync('node', ['test/run-tests.mjs', ...files], { encoding: 'utf8', env })
  return { status: r.status, junit: existsSync(JUNIT) ? readFileSync(JUNIT, 'utf8') : '' }
}
const kindOf = (junit, file) => junit.match(new RegExp(`name="${file}"[^>]*>(?:<(failure|error) )?`))?.[1] ?? 'pass'

let r = run('test/fixtures/pass.js', 'test/fixtures/assert-fail.js')
assert.equal(r.status, 1, 'a failing suite fails the run')
assert.equal(kindOf(r.junit, 'test/fixtures/pass.js'), 'pass')
assert.equal(kindOf(r.junit, 'test/fixtures/assert-fail.js'), 'failure', 'assertion → failure')

r = run('test/fixtures/assert-syntaxerror.js')
assert.equal(kindOf(r.junit, 'test/fixtures/assert-syntaxerror.js'), 'failure', 'an assertion naming SyntaxError is still a failure')

r = run('test/fixtures/missing-import.js', 'test/fixtures/no-such-file.js')
assert.equal(r.status, 1)
assert.equal(kindOf(r.junit, 'test/fixtures/missing-import.js'), 'error', 'missing import → error')
assert.equal(kindOf(r.junit, 'test/fixtures/no-such-file.js'), 'error', 'missing test file → error')

r = run('./test/fixtures/pass.js')
assert.equal(r.status, 0, './ path runs')
assert.equal(kindOf(r.junit, 'test/fixtures/pass.js'), 'pass', './ path reported in canonical form')

r = run('test/fixtures/caught-missing-import.js')
assert.equal(kindOf(r.junit, 'test/fixtures/caught-missing-import.js'), 'error', 'a load error the suite caught itself → error')

r = run('test/fixtures/pass.js', './test/fixtures/pass.js')
assert.equal(r.junit.match(/<testcase /g)?.length, 1, 'a file named twice runs once (a repeated case reads as a retry)')

r = run('test/fixtures/big-output.js')
assert.equal(kindOf(r.junit, 'test/fixtures/big-output.js'), 'pass', 'output beyond 1 MiB is no failure')

r = run('test/fixtures/ansi-fail.js')
assert.equal(kindOf(r.junit, 'test/fixtures/ansi-fail.js'), 'failure')
assert.doesNotMatch(r.junit, /[\x00-\x08\x0B\x0C\x0E-\x1F]/, 'junit has no XML-invalid control characters')

r = run('test/fixtures/page-ok.html', 'test/fixtures/page-fail.html', 'test/fixtures/page-noresult.html', 'test/fixtures/page-caught-load.html')
assert.equal(r.status, 1)
assert.equal(kindOf(r.junit, 'test/fixtures/page-ok.html'), 'pass')
assert.equal(kindOf(r.junit, 'test/fixtures/page-fail.html'), 'failure', 'a failed page check → failure')
assert.equal(kindOf(r.junit, 'test/fixtures/page-noresult.html'), 'error', 'a page that never finished → error')
assert.equal(kindOf(r.junit, 'test/fixtures/page-caught-load.html'), 'error', 'a page that caught its own failed import → error')

mkdirSync('test-results', { recursive: true }); writeFileSync(JUNIT, 'stale')
r = run('README.md')
assert.equal(r.status, 2, 'a non-test file is a usage error')
assert.equal(r.junit, '', 'no stale junit survives a run that wrote none')
console.log('RUNNER-UNIT-OK')
