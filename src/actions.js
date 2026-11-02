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
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id), waitMs = 20000,
    now = () => Date.now(), expiryMs = 25000, revive = () => {} }) {
    Object.assign(this, { cancelRequest: cancel, changed, message, setTimer, clearTimer, waitMs, now, expiryMs, revive })
    this.current = null
    this.cancelled = new Set()
    this.games = new Set() // ids of games that started (attached) here
  }

  async start(label, create, { message = this.message, failure = `${label} challenge failed: `,
    started = `Challenging ${label}…` } = {}) {
    if (this.current) return false
    const request = this.current = { label, message, id: null, at: this.now(), creating: true, cancelling: false, ended: new Map() }
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
      request.at = this.now()
      if (this.current !== request) {
        const id = request.id
        if (request.abandoned && id && !this.games.has(id)) { // Cancel gave up: withdraw it, unless it is being played
          this._remember(id)
          this.cancelRequest(id).catch(() => { // still live: its gameStart may already be dropped, attach it
            this.cancelled.delete(id)
            this.revive(id)
          })
        }
        return true
      }
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
    if (!request.creating) return this._cancel(request)
    // The creation may never answer (half-open connection after headset sleep): give up after waitMs.
    request.giveUp = this.setTimer(() => { // own timer: a gameStart meanwhile must not stop it
      if (this.current !== request || !request.creating) return
      request.abandoned = true
      this._clear(request)
      this._message(request, 'Challenge cleared — if Lichess still shows it, it expires on its own')
    }, this.waitMs)
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
    this._remember(id, this.games)
    const request = this.current
    if (!request) return
    request.gameId = id
    this.clearTimer(request.timer)
    if (request.creating || request.cancelling) return
    if (!request.id || request.id === id) this._clear(request)
    else void this._cancel(request)
  }

  wasCancelled(id) { return this.cancelled.has(id) }

  _remember(id, set = this.cancelled) {
    set.add(id)
    if (set.size > 32) set.delete(set.values().next().value)
  }

  // What a reload needs to restore: a challenge Lichess may still turn into a game, even one
  // whose id never arrived. Its own game ends it.
  saved() {
    const r = this.current
    return r && r.gameId !== r.id ? { id: r.id, label: r.label, at: r.at } : null
  }

  // After a reload. Realtime challenges without keepAliveStream expire 20 s after creation
  // (Lichess API); expiryMs adds a margin for clock skew. Events still end it earlier.
  restore(saved) {
    const { id = null, label, at } = saved || {}
    const left = Math.min(at + this.expiryMs - this.now(), this.expiryMs) // a clock rollback can't stretch it
    if (this.current || !label || !Number.isFinite(at) || !(left > 0)) return false
    const request = this.current = { label, message: this.message, id, at, creating: false, cancelling: false, ended: new Map() }
    request.expiry = this.setTimer(() => { // kept through a failed cancel: the challenge is gone by then
      this._clear(request)
      this._message(request, `${label} challenge expired`)
    }, left)
    this._message(request, `Still waiting for ${label} — cancel the challenge before trying again`)
    return true
  }

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
    if (cancelled && request.id) this._remember(request.id)
    this.clearTimer(request.timer)
    this.clearTimer(request.expiry)
    this.clearTimer(request.giveUp)
    this.current = null
    this.changed()
  }
}
