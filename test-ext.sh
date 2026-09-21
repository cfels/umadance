#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

dev_root="${UMADANCE_DEV_ROOT:-/tmp/umadance-dev}"
profile="${UMADANCE_DEV_PROFILE:-$dev_root/profile}"

node dev/dev.js sync

if [ "${1:-}" = "--watch" ]; then
	shift
	node dev/dev.js watch &
	watcher=$!
	trap 'kill $watcher 2>/dev/null || true' EXIT
fi

exec "$dev_root/code" --user-data-dir="$profile" --skip-welcome --skip-release-notes "$@"
