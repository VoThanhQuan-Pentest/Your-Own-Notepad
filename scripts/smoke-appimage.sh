#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /absolute/path/to/CommandVault.AppImage" >&2
  exit 64
fi

artifact_path="$1"
if [[ ! -x "$artifact_path" ]]; then
  echo "AppImage is missing or not executable: $artifact_path" >&2
  exit 66
fi

smoke_root="$(mktemp -d)"
cleanup() {
  rm -rf "$smoke_root"
}
trap cleanup EXIT

mkdir -p "$smoke_root/config" "$smoke_root/data" "$smoke_root/state" "$smoke_root/cache"

set +e
XDG_CONFIG_HOME="$smoke_root/config" \
XDG_DATA_HOME="$smoke_root/data" \
XDG_STATE_HOME="$smoke_root/state" \
XDG_CACHE_HOME="$smoke_root/cache" \
timeout --signal=TERM 8s "$artifact_path"
status=$?
set -e

if [[ $status -ne 0 && $status -ne 124 ]]; then
  exit "$status"
fi
