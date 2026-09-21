#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

if [ ! -d node_modules ]; then
	pnpm install
fi

pnpm run package

if [ "${1:-}" = "--vsix" ]; then
	pnpm dlx --allow-build=@vscode/vsce-sign @vscode/vsce package --allow-missing-repository
	echo "vsix: $(ls -1t ./*.vsix | head -1)"
else
	echo "built: $(pwd)/dist/extension.js"
fi
