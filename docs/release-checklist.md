# Release checklist

Record the tested commit, date, browser/headset versions, results and any limitations in the
release PR. Automated checks and emulated input are useful evidence; actual Quest and live
Lichess checks remain separate manual work.

## Automated and repository checks

- Run `node test/run-tests.mjs` from a clean checkout with the documented minimum Node version
  (agents: the bx gate, see `CLAUDE.md`). Investigate failures; keep `test-results/junit.xml`.
- Confirm the release commit passed the bx gate (`bx record gate <sha>` exits 0).
- Review dependency/asset changes and `THIRD_PARTY_NOTICES.md`. Check staged files and
  history for accidentally committed credentials or private signing material.
- Verify README/contributor commands, issue templates and the private reporting link in
  `SECURITY.md`. GitHub private vulnerability reporting must remain enabled for that link.
- Increment the service-worker `CACHE` version when shipping app changes. Confirm
  `test/service-worker-unit.js` passes, then verify the actual HTTPS deployment below.

## Desktop and HTTPS deployment

- Load the actual `index.html` with a fresh profile; check startup, console errors, Free
  board legal/illegal moves, Undo/Reset, puzzles, Find squares and Puzzle rush.
- Confirm menu Back/Return preserves activity progress, appearance choices apply, and
  running clocks continue while settings are open.
- On an HTTPS staging or deployed copy, load online, reload under service-worker control,
  then test offline startup and cached Free board. Puzzles and online games still need
  Lichess connectivity. Test an app update and ensure the new version is used after reload.
- Check branding, screenshot previews, source/license links and mobile page layout.

## Manual Quest pass

- Record headset model, Quest Browser version and whether controller or hand tracking was
  used. Enter VR, exit and re-enter; verify table height, scale, orientation and resolution.
- Test controllers, hands in point/pinch mode, and hands in grab mode. Cover selection,
  hover, legal/illegal moves, direct grabs, cancelled grabs, lost tracking and promotion.
- Use Menu, Back and Return during each activity. Confirm controls remain reachable after
  changing table height, board size and input mode.
- Check Study, Sunset, Night and Minimal for readable pieces/text, acceptable performance
  and comfort. Record observed problems instead of inferring hardware performance from
  the software-rendered smoke suites.
- Sleep/wake the headset, briefly interrupt the network, and verify a live game resumes
  without duplicated moves or clocks becoming stuck.

## Live services and optional packaging

- With your own test account, verify OAuth login/return/logout, anonymous practice while
  logged in, an engine challenge, cancelling a human seek, reconnection, resign confirmation
  and game-end review. Use agreed test partners for multiplayer checks.
- Keep live credentials out of screenshots, logs and committed fixtures. Automated checks
  must continue to run without an account.
- If releasing an APK, separately validate the pinned Android toolchain, package/host,
  signing certificate and `assetlinks.json`; increase `appVersionCode`, install the signed
  APK, and test launch/update on hardware. Preserve the existing signing key for updates.
- Deploy only with `deploy/deploy.sh`: it uploads a complete release directory and switches
  the `current` symlink atomically. Hosting, caching and APK details: [OPERATIONS.md](OPERATIONS.md).

Publish only the checks actually performed. If headset access or a live-service check was
unavailable, list that limitation in the release notes.
