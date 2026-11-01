// run-tests fixture: an assertion whose message carries an ANSI escape
import assert from 'node:assert'
assert.equal('\x1b[31mred', 'plain')
