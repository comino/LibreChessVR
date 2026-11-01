// run-tests fixture: an assertion fails whose text names SyntaxError
import assert from 'node:assert'
assert.throws(() => JSON.parse('{'), TypeError)
