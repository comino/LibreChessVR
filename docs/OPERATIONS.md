# LibreChessVR operations

Hosting, caching, packaging and headset testing. Deploys and the APK are Sven's (see `CLAUDE.md` § Release path).

## App packaging & deploy

- Hosted on **Janasven** (SSH alias `janasven`, 157.90.174.133): `deploy/deploy.sh` (Sven only)
  uploads a complete release under `/var/www/librechessvr/releases` and atomically switches
  the `current` symlink, retaining earlier releases for rollback. nginx serves `current` via
  `/etc/nginx/snippets/librechessvr-static.conf`; the site is `/etc/nginx/sites-available/librechessvr`.
  `CACHE` bump: see `CLAUDE.md` § Release path. Verify the public URL after deploying.
- Public address **https://librechessvr.com**: nginx serves the app and redirects `www` to
  the apex. Fred's Caddy proxies old-IP requests and the sslip origin to Janasven for existing
  Quest wrappers. `/opt/parallax/web` on fred is no longer the public document root.
  `deploy/nginx-site.conf` and `deploy/nginx-static.conf` are byte-identical to Janasven's live
  files (checked read-only 2026-11-02, PRJ-54); `deploy/Caddyfile.parallax` is the proxy from fred's
  working tree (not checked against `/etc/caddy`). Inspect the active configuration before changing hosting. Storage is origin-specific: users moving from an
  earlier address sign in to Lichess again, with separate local settings and practice records.
- `chess.janasven.de` serves the same release directory on Janasven. `index.html`
  redirects ordinary visits to the new domain, preserving the path, query and fragment.
  OAuth returns (`code` or `error`) stay on the old origin to finish with its stored verifier.
- Caching: nginx sends `Cache-Control: no-cache` on every file (revalidate → 304s); `sw.js` is
  network-first for app files (cache only offline) and cache-first for versioned CDN modules.
  Never go back to stale-while-revalidate for app modules: it mixed old and new ES modules
  after a deploy (old settings page inside a new scene).
- PWA: `manifest.webmanifest`, `sw.js` (registered on https only, so localhost dev never caches),
  icons `assets/brand/icon-*.png`. `.well-known/assetlinks.json` ties the APK to the site (no URL bar).
- Quest APK: `android/build.sh` (Meta's Bubblewrap fork, `horizonOSAppMode: immersive`,
  package `com.comino.parallax`). Toolchain: brew `openjdk@17`, `android-commandlinetools`
  (SDK root needs a `tools -> cmdline-tools/latest` symlink for Bubblewrap), `~/.bubblewrap/config.json`.
  Signing key: `~/.parallax/parallax.keystore` + `keystore.pass` — **never lose it** (updates must
  match; the asset-links fingerprint is derived from it). Bump `appVersionCode` for updates.
- Login: `src/auth.js` OAuth PKCE with lichess (client_id `parallax`, no registration);
  redirect back to the app origin, token then stored like a pasted one.
- VR resolution: `_startSession` sets `setFramebufferScaleFactor` before every session —
  `XRWebGLLayer.getNativeFramebufferScaleFactor` for `resolution: 'native'` (default), 1 for
  'normal' (Settings → Advanced, `localStorage.resolution`; applies from the next VR entry).
- Launch: headsets get `#launch` (Enter VR) + `board.offerVR()` (Quest's own VR prompt);
  three's VRButton is gone — `board.enterVR()` / `xrSupported()`.

## Testing on the Quest

WebXR needs a secure context — plain `http://<lan-ip>:8123` never shows the VR button.
Use adb reverse (headset in developer mode, USB or wireless adb):

    adb reverse tcp:8123 tcp:8123
    python3 -m http.server 8123

then open `http://localhost:8123` in the Quest Browser (localhost = secure context;
stable origin, so the lichess token survives in localStorage). Debug the headset tab
from desktop Chrome via `chrome://inspect#devices`. The Quest browser caches hard —
force-reload after JS changes. Alternative without dev mode:
`cloudflared tunnel --url http://localhost:8123` (URL rotates → token retyped each run).
Desktop pre-check for controller input: Meta's Immersive Web Emulator extension.
