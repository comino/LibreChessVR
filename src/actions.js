// Time-sensitive actions keep explicit state so delayed callbacks cannot act on a new game.
export class Confirmation {
  constructor({ now = () => performance.now(), windowMs = 3000 } = {}) {
    Object.assign(this, { now, windowMs })
    this.reset()
  }

  reset() { this.armed = null }

  confirm(key) {
    const now = this.now()
    if (key != null && this.armed?.key === key && now < this.armed.until) {
      this.reset()
      return true
    }
    this.armed = key == null ? null : { key, until: now + this.windowMs }
    return false
  }
}

// A successful POST is still pending until a game or terminal challenge event arrives.
// Cancelling a fetch does not cancel its server-side challenge: retain the lock until
// the response identifies it and the cancellation endpoint confirms the outcome.
export class PendingChallenge {
  constructor({ cancel, changed = () => {}, message = () => {},
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id), waitMs = 20000 }) {
    Object.assign(this, { cancelRequest: cancel, changed, message, setTimer, clearTimer, waitMs })
    this.current = null
    this.cancelled = new Set()
  }

  async start(label, create, { message = this.message, failure = `${label} challenge failed: `,
    started = `Challenging ${label}…` } = {}) {
    if (this.current) return false
    const request = this.current = { label, message, id: null, creating: true, cancelling: false, ended: new Map() }
    this._message(request, started)
    request.timer = this.setTimer(() => {
      if (this.current === request && !request.gameId)
        this._message(request, request.id || request.creating
          ? `Still waiting for ${label} — cancel the challenge before trying again`
          : `${label} challenge status unknown — wait for reconnection or check Lichess`)
    }, this.waitMs)
    try {
      const result = await create()
      request.creating = false
      request.id = result?.challenge?.id || result?.id || null
      if (this.current !== request) return true
      if (request.ended.has(request.id)) {
        this._clear(request, true)
        this._message(request, request.ended.get(request.id))
      } else if (request.gameId && request.id === request.gameId && !request.cancelling) {
        this._clear(request)
      } else if (request.cancelling || request.gameId && request.id !== request.gameId) {
        // A different game attached while creation was in flight. Clean up only
        // this request's ID; never cancel the game that happened to arrive first.
        await this._cancel(request)
      } else if (!request.id) {
        this._message(request, `${label} challenge status unknown — wait for reconnection or check Lichess`)
      } else this.changed()
    } catch (e) {
      request.creating = false
      if (this.current !== request) return true
      if (e instanceof TypeError || e instanceof SyntaxError || e.status >= 500) {
        // A lost response can conceal a successfully created game. Repeating the
        // POST is unsafe; the event stream can still resolve the pending action.
        request.cancelling = false
        this._message(request, `${label} challenge status unknown — wait for reconnection or check Lichess`)
      } else {
        this._clear(request)
        this._message(request, failure + e.message)
      }
    }
    return true
  }

  async cancel() {
    const request = this.current
    if (!request || request.cancelling) return
    request.cancelling = true
    this.clearTimer(request.timer)
    this._message(request, 'Cancelling challenge…')
    if (!request.creating) await this._cancel(request)
  }

  async _cancel(request) {
    if (this.current !== request) return
    request.cancelling = true
    this.clearTimer(request.timer)
    this.changed()
    if (!request.id) {
      // Creation failed without an id: nothing to cancel on Lichess. Release the lock here;
      // if the challenge did exist and is accepted, its gameStart still attaches the game.
      this._clear(request)
      this._message(request, 'Challenge cleared — if Lichess still shows it, it expires on its own')
      return
    }
    try {
      await this.cancelRequest(request.id)
      if (this.current !== request) return
      this._clear(request, true)
      this._message(request, 'Challenge cancelled')
    } catch (e) {
      if (this.current !== request) return
      if (e.status === 404) {
        // Lichess checks both active challenges and accepted games before 404.
        // This also resolves an expired challenge whose terminal event was lost.
        this._clear(request, true)
        this._message(request, 'Challenge is no longer active')
        return
      }
      if (request.gameId === request.id) {
        // The game is already attached and may have become non-abortable. Its
        // normal lifecycle guards new starts; a failed cancellation must not
        // leave a second, permanent lock after that game finishes.
        this._clear(request)
        return
      }
      request.cancelling = false // keep the request locked, but allow another cancellation attempt
      this._message(request, 'Cancellation failed: ' + e.message)
    }
  }

  gameStarted(id) {
    const request = this.current
    if (!request) return
    request.gameId = id
    this.clearTimer(request.timer)
    if (request.creating || request.cancelling) return
    if (!request.id || request.id === id) this._clear(request)
    else void this._cancel(request)
  }

  wasCancelled(id) { return this.cancelled.has(id) }

  ended(id, text) {
    const request = this.current
    if (!request || !id) return false
    if (request.id !== id) {
      if (request.creating) request.ended.set(id, text)
      return false
    }
    this._clear(request, true)
    this._message(request, text)
    return true
  }

  _message(request, text) {
    request.notice = text
    if (this.current === request) this.changed()
    if (!request.gameId) request.message(text)
  }

  _clear(request, cancelled = false) {
    if (this.current !== request) return
    if (cancelled && request.id) {
      this.cancelled.add(request.id)
      if (this.cancelled.size > 32) this.cancelled.delete(this.cancelled.values().next().value)
    }
    this.clearTimer(request.timer)
    this.current = null
    this.changed()
  }
}
