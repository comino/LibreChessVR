// Runs smoke pages in a headless Chrome (DevTools on $CDP_PORT) in real time, one after another
// with the origin's storage wiped in between (pages must not share localStorage); polls #result
// until it is filled (60 s max), prints "page: result". Exit code 1 unless all *-OK.
// Real time, not --virtual-time-budget: virtual time stalls image decoding (textured GLB).
const [base, ...pages] = process.argv.slice(2)
const port = process.env.CDP_PORT || 9333
async function run(page) {
  const browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const bws = new WebSocket(browser.webSocketDebuggerUrl)
  await new Promise(r => bws.addEventListener('open', r))
  await new Promise(r => {
    bws.addEventListener('message', r, { once: true })
    bws.send(JSON.stringify({ id: 1, method: 'Storage.clearDataForOrigin', params: { origin: base, storageTypes: 'all' } }))
  })
  bws.close()
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${base}/${page}`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const send = (method, params) => new Promise(res => { const my = ++id
    ws.addEventListener('message', function h(e) { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', h); res(m.result) } })
    ws.send(JSON.stringify({ id: my, method, params })) })
  await new Promise(r => ws.addEventListener('open', r))
  let out = ''
  for (const t0 = Date.now(); Date.now() - t0 < 60000 && !out; await new Promise(r => setTimeout(r, 300)))
    out = (await send('Runtime.evaluate', { expression: "document.getElementById('result')?.textContent || ''" }))?.result?.value || ''
  ws.close()
  await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`)
  return out || 'NO RESULT'
}
const results = []
for (const p of pages) {
  results.push([p, await run(p)])
  console.log(`${p}: ${results.at(-1)[1]}`)
}
process.exit(results.every(([, r]) => /-OK/.test(r)) ? 0 : 1)
