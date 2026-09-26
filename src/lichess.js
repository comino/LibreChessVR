// Lichess Board API client. Everything is client-side fetch; lichess supports CORS.
// Docs: https://lichess.org/api#tag/Board

const API = 'https://lichess.org'

// Splits streamed text chunks into parsed NDJSON objects (chunks may cut lines anywhere).
export function makeLineSplitter(onMsg) {
  let buf = ''
  return {
    push(text) {
      buf += text
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const l of lines) if (l.trim()) onMsg(JSON.parse(l))
    },
    end() {
      if (buf.trim()) onMsg(JSON.parse(buf))
      buf = ''
    }
  }
}

export class Lichess {
  constructor(token = null) { this.token = token }

  _headers(extra = {}) {
    return { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...extra }
  }

  async _check(r) {
    if (r.ok) return r
    let msg = r.status + ' ' + r.statusText
    try { msg = (await r.json()).error || msg } catch { /* not json */ }
    throw new Error(msg)
  }

  async _get(path) {
    const r = await this._check(await fetch(API + path, { headers: this._headers() }))
    return r.json()
  }

  async _post(path, form) {
    const r = await this._check(await fetch(API + path, {
      method: 'POST',
      headers: this._headers(),
      body: form ? new URLSearchParams(form) : undefined
    }))
    return r.json().catch(() => ({}))
  }

  account() { return this._get('/api/account') }
  playing() { return this._get('/api/account/playing') }

  // Reads an NDJSON stream until it closes or the signal aborts.
  async stream(path, onMsg, signal, opts = {}) {
    const r = await this._check(await fetch(API + path, {
      ...opts, signal, headers: this._headers(opts.headers)
    }))
    const splitter = makeLineSplitter(onMsg)
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      splitter.push(dec.decode(value, { stream: true }))
    }
    splitter.end()
  }

  streamEvents(onMsg, signal) {
    return this.stream('/api/stream/event', onMsg, signal)
  }

  streamGame(gameId, onMsg, signal) {
    return this.stream(`/api/board/game/stream/${gameId}`, onMsg, signal)
  }

  // The seek stays active only while this request is open; resolves when matched or aborted.
  seek({ time, increment, rated, color }, signal) {
    return this.stream('/api/board/seek', () => {}, signal, {
      method: 'POST',
      body: new URLSearchParams({ time, increment, rated, color })
    })
  }

  challengeAi({ level, time, increment, color = 'random' }) {
    return this._post('/api/challenge/ai', {
      level, color, 'clock.limit': time * 60, 'clock.increment': increment
    })
  }

  puzzleNext(difficulty = 'normal') { return this._get('/api/puzzle/next?difficulty=' + difficulty) }

  move(gameId, uci) { return this._post(`/api/board/game/${gameId}/move/${uci}`) }
  resign(gameId) { return this._post(`/api/board/game/${gameId}/resign`) }
}
