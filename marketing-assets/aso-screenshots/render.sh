#!/bin/bash
# Render one or all built HTML screens to final/<slug>.png at 1290x2796.
# Usage: ./render.sh [slug]   (omit slug to render every src/*.html)
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p final
shopt -s nullglob
targets=()
if [ -n "$1" ]; then targets=("src/$1.html"); else targets=(src/*.html); fi
for f in "${targets[@]}"; do
  slug=$(basename "$f" .html)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --force-device-scale-factor=1 --window-size=1290,2796 --virtual-time-budget=9000 \
    --screenshot="final/$slug.png" "file://$PWD/$f" >/dev/null 2>&1
  echo "rendered final/$slug.png"
done
