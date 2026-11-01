#!/usr/bin/env node
// run-tests fixture: stands in for run-smoke.sh and prints each page's file content as its result
import { readFileSync } from 'node:fs'
for (const page of process.argv.slice(2)) console.log(`${page}: ${readFileSync(page, 'utf8').trim()}`)
