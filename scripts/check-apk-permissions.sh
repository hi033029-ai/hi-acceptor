#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/check-apk-permissions.sh /path/to/app-release.apk" >&2
  exit 1
fi

APK_PATH="$1"
AAPT_BIN="${AAPT_BIN:-aapt}"
if [[ ! -x "$AAPT_BIN" && "$AAPT_BIN" != "aapt" ]] || ! command -v "$AAPT_BIN" >/dev/null 2>&1; then
  echo "Error: aapt is not installed or not in PATH." >&2
  exit 1
fi

BAD_PERMISSIONS=(
  "android.permission.RECORD_AUDIO"
  "android.permission.READ_MEDIA_AUDIO"
  "android.permission.READ_MEDIA_IMAGES"
  "android.permission.READ_MEDIA_VIDEO"
  "android.permission.ACCESS_BACKGROUND_LOCATION"
  "android.permission.CAMERA"
  "android.permission.READ_CONTACTS"
  "android.permission.READ_SMS"
  "android.permission.RECEIVE_SMS"
  "android.permission.SEND_SMS"
)

PERMISSION_OUTPUT="$("$AAPT_BIN" dump permissions "$APK_PATH")"
failed=0
for permission in "${BAD_PERMISSIONS[@]}"; do
  if grep -q "$permission" <<<"$PERMISSION_OUTPUT"; then
    echo "FAIL: forbidden permission found: $permission"
    failed=1
  else
    echo "OK: not found: $permission"
  fi
done

if [[ $failed -ne 0 ]]; then
  exit 1
fi
echo "APK permission check passed."
