// test/run-tests.mjs classifies each file for bx red: an assertion is a junit <failure>, a suite that
// cannot run is an <error> (never red), and paths are reported as given in canonical form. PRJ-50.
import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const JUNIT = 'test-results/junit.xml'
const run = (...files) => {
  const r = spawnSync('node', ['test/run-tests.mjs', ...files], { encoding: 'utf8' })
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

mkdirSync('test-results', { recursive: true }); writeFileSync(JUNIT, 'stale')
r = run('README.md')
assert.equal(r.status, 2, 'a non-test file is a usage error')
assert.equal(r.junit, '', 'no stale junit survives a run that wrote none')
console.log('RUNNER-UNIT-OK')
