// run-tests fixture: a suite that catches a load error itself (like hunt-unit's check helper)
try { await import('../../src/does-not-exist.js') } catch (e) { console.log('FAIL import: ' + e.message); process.exit(1) }
