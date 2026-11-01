// run-tests fixture: more output than spawnSync's default 1 MiB buffer
process.stdout.write('x'.repeat(2 * 1024 * 1024) + '\n')
console.log('BIG-OK')
