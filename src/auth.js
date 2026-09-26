// "Log in with lichess": OAuth2 authorization code + PKCE, fully client-side (lichess needs
// no app registration or secret). The access token then works like a pasted API token.

const LICHESS = 'https://lichess.org'
export const CLIENT_ID = 'parallax'
export const SCOPES = 'board:play challenge:write'

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = n => b64url(crypto.getRandomValues(new Uint8Array(n)))

export async function pkcePair() {
  const verifier = random(32)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return { verifier, challenge }
}

export const authorizeUrl = ({ challenge, state, redirect }) => `${LICHESS}/oauth?` + new URLSearchParams({
  response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirect,
  code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state
})

// Leaves the page for lichess; it comes back to redirect with ?code=…&state=….
export async function startLogin(redirect = location.origin + location.pathname) {
  const { verifier, challenge } = await pkcePair(), state = random(12)
  sessionStorage.setItem('oauth', JSON.stringify({ verifier, state, redirect }))
  location.assign(authorizeUrl({ challenge, state, redirect }))
}

// On the way back: exchanges the code for a token and cleans the URL. null = not a login return.
export async function finishLogin(url = location.href) {
  const u = new URL(url), code = u.searchParams.get('code')
  if (!code && !u.searchParams.get('error')) return null
  history.replaceState(null, '', u.pathname)
  let saved = null
  try { saved = JSON.parse(sessionStorage.getItem('oauth')) } catch { /* corrupt */ }
  sessionStorage.removeItem('oauth')
  if (!code) throw new Error('Login cancelled')
  if (!saved || saved.state !== u.searchParams.get('state')) throw new Error('Login expired — try again')
  const r = await fetch(LICHESS + '/api/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: saved.verifier,
      redirect_uri: saved.redirect, client_id: CLIENT_ID
    })
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `Login failed (${r.status})`)
  return j.access_token
}
