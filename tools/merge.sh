#!/bin/sh
# Lands a reviewed head on main: bx merge-check (head contains origin/main, its tree passed the gate,
# red or waiver recorded), then a fast-forward push of exactly that sha. Usage: tools/merge.sh <sha>
set -eu
sha=$(git rev-parse --verify "${1:?usage: tools/merge.sh <sha>}^{commit}")
bx merge-check "$sha"
git push origin "$sha:refs/heads/main"
