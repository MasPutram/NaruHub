#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-/root/NaruHub/monitor/.deploy}"
RELEASE="$BASE/releases/$RELEASE_ID"
ARCHIVE="/tmp/naruhub-monitor-$RELEASE_ID.tar.gz"
ACTIVE="$BASE/active"

mkdir -p "$BASE/releases"
rm -rf "$RELEASE"
mkdir -p "$RELEASE"

tar -xzf "$ARCHIVE" -C "$RELEASE"

if [ -f "$BASE/.env" ]; then
  cp "$BASE/.env" "$RELEASE/standalone/.env"
fi

if [ ! -f "$RELEASE/standalone/server.js" ]; then
  echo "FATAL: standalone/server.js not found"
  rm -rf "$RELEASE"
  exit 1
fi

PREVIOUS=""
if [ -L "$ACTIVE" ]; then
  PREVIOUS="$(readlink -f "$ACTIVE")"
elif [ -d "$ACTIVE" ]; then
  rm -rf "$ACTIVE"
fi

TMPLINK="$BASE/active.new.$$"
ln -s "$RELEASE" "$TMPLINK"
mv -T "$TMPLINK" "$ACTIVE"

systemctl restart naruhub-monitor
sleep 2

if systemctl is-active --quiet naruhub-monitor; then
  echo "Deploy successful: $RELEASE_ID"
else
  echo "Deploy failed, rolling back..."
  journalctl -u naruhub-monitor --no-pager -n 15
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ]; then
    TMPLINK_RB="$BASE/active.rollback.$$"
    ln -s "$PREVIOUS" "$TMPLINK_RB"
    mv -T "$TMPLINK_RB" "$ACTIVE"
    systemctl restart naruhub-monitor
    echo "Rolled back to previous release"
  fi
  exit 1
fi

rm -f "$ARCHIVE"
cd "$BASE/releases"
ls -1dt */ 2>/dev/null | tail -n +6 | while read -r old; do
  OLDPATH="$BASE/releases/$old"
  if [ "$OLDPATH" != "$RELEASE" ] && [ "$OLDPATH" != "${PREVIOUS%/}" ]; then
    rm -rf "$OLDPATH"
  fi
done
