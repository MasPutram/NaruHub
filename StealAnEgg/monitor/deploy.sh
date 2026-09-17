#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───
VPS_HOST="103.253.212.251"
VPS_USER="root"
BASE="/root/NaruHub/StealAnEgg/monitor/.deploy"
RELEASE_ID="$(git rev-parse --short HEAD)"
ARCHIVE="naruhub-monitor.tar.gz"

echo "═══ NaruHub Local Deploy ═══"
echo "Release: $RELEASE_ID"
echo ""

# ─── Build ───
echo "▸ Building..."
npm run build

echo "▸ Preparing standalone artifact..."
rm -rf deploy-artifact
mkdir -p deploy-artifact/standalone

cp -a .next/standalone/. deploy-artifact/standalone/

if [ -d ".next/static" ]; then
  mkdir -p deploy-artifact/standalone/.next/static
  cp -a .next/static/. deploy-artifact/standalone/.next/static/
fi

if [ -d "public" ]; then
  mkdir -p deploy-artifact/standalone/public
  cp -a public/. deploy-artifact/standalone/public/
fi

echo "▸ Creating archive..."
tar -czf "$ARCHIVE" -C deploy-artifact .
SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "  Archive: $SIZE"

# ─── Upload ───
echo "▸ Uploading to VPS..."
scp "$ARCHIVE" "${VPS_USER}@${VPS_HOST}:/tmp/naruhub-monitor-${RELEASE_ID}.tar.gz"

# ─── Deploy on VPS ───
echo "▸ Deploying on VPS..."
ssh "${VPS_USER}@${VPS_HOST}" "RELEASE_ID='${RELEASE_ID}' bash -s" <<'REMOTE'
set -euo pipefail

BASE="/root/NaruHub/StealAnEgg/monitor/.deploy"
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
  echo "✓ Deploy successful: $RELEASE_ID"
else
  echo "✗ Deploy failed, rolling back..."
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

# Cleanup: keep last 5 releases
rm -f "$ARCHIVE"
cd "$BASE/releases"
ls -1dt */ 2>/dev/null | tail -n +6 | while read -r old; do
  OLDPATH="$BASE/releases/$old"
  if [ "$OLDPATH" != "$RELEASE" ] && [ "$OLDPATH" != "${PREVIOUS%/}" ]; then
    rm -rf "$OLDPATH"
  fi
done
REMOTE

# ─── Cleanup local ───
rm -rf deploy-artifact "$ARCHIVE"
echo ""
echo "═══ Done ═══"
