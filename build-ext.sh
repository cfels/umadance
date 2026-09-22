#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

if [ ! -d node_modules ]; then
	bun install
fi

bun run package

if [ "${1:-}" = "--vsix" ]; then
	bun run vsix
	echo "vsix: $(ls -1t ./*.vsix | head -1)"
else
	echo "built: $(pwd)/dist/extension.js"
fi
