# LibreChessVR web package

This package contains the browser app and its 3D assets, ready to serve. The release
number is in `VERSION`. No compilation, package installation or API key is needed.

## Run locally

Extract the archive, open a terminal in the extracted directory, and run:

```sh
python3 -m http.server 8123 --bind 127.0.0.1
```

Open <http://localhost:8123/> in a desktop browser.

## Host for browsers and headsets

Upload the extracted contents to a static HTTPS host, keeping the directory
structure. Serve `index.html` as the default page. VR needs a compatible WebXR
browser and a secure context: HTTPS, or localhost on the headset itself.

Set `Cache-Control: no-cache` on app files so clients revalidate after an update.
Libraries and fonts load from CDNs; puzzles and online games use Lichess and need
internet access. This package is not a fully offline distribution.

The optional Android wrapper is distributed in the source repository and needs
its own signing setup. This web package contains no APK.

Project code is MIT licensed; see `LICENSE` and `THIRD_PARTY_NOTICES.md` for credits.
Full documentation and source: <https://github.com/comino/LibreChessVR>.
