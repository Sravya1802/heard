#!/bin/sh
# Renders deck.html to heard-deck.pdf (1920x1080 pages). Usage: sh build.sh https://your-demo-url
cd "$(dirname "$0")"
URL="${1:-see the submission}"
sed "s#{{DEMO_URL}}#$URL#g" deck.html > .deck-built.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf="$PWD/heard-deck.pdf" "file://$PWD/.deck-built.html" 2>/dev/null
rm -f .deck-built.html
echo "wrote $PWD/heard-deck.pdf"
