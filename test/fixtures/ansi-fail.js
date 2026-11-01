// run-tests fixture: a failure whose first error line carries an ANSI escape
throw new Error('\x1b[31mred\x1b[0m check failed')
