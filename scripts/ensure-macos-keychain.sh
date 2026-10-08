#!/usr/bin/env bash
# scripts/ensure-macos-keychain.sh — CI macOS 签名钥匙串引导（设计为被 source）。
#
# KStock 同款路线：MAC_CERTIFICATE（base64 .p12）导入专用钥匙串，导出
# CSC_KEYCHAIN + CSC_NAME。**刻意不走 CSC_LINK**：electron-builder 的临时
# 钥匙串分支有上游缺陷（实测 SecKeychainUnlock 密码不正确——2026-10-08
# v0.1.0 首发实踩）；签名身份从导入证书自动发现（仓库无需额外 secret）。
#
# 幂等：身份已在钥匙串可见则跳过导入。依赖环境变量：
#   MAC_CERTIFICATE（base64 .p12）、MAC_CERTIFICATE_PWD
# 导出：CSC_KEYCHAIN、CSC_NAME；unset CSC_LINK、CSC_KEY_PASSWORD
if [ "$(uname -s)" != "Darwin" ]; then
  return 0 2>/dev/null || exit 0
fi

OK_KC_PASS="openkylin-ci-keychain"
OK_TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"

if security find-identity -v -p codesigning 2>/dev/null | grep -qF "Developer ID Application"; then
  echo "==> 签名身份已在钥匙串可见，跳过导入"
  OK_KC="$(security default-keychain -d user | tr -d '"' | xargs)"
else
  [ -n "${MAC_CERTIFICATE:-}" ] || { echo "ERROR: 缺 MAC_CERTIFICATE（base64 .p12）" >&2; return 1 2>/dev/null || exit 1; }
  OK_KC="$OK_TMP/openkylin-sign.keychain-db"
  CERT_FILE="$OK_TMP/openkylin-sign.p12"
  python3 -c 'import base64,sys; sys.stdout.buffer.write(base64.b64decode(sys.stdin.buffer.read()))' \
    <<<"$MAC_CERTIFICATE" > "$CERT_FILE"
  security delete-keychain "$OK_KC" >/dev/null 2>&1 || true
  security create-keychain -p "$OK_KC_PASS" "$OK_KC" > /dev/null
  security set-keychain-settings -lut 21600 "$OK_KC"
  security unlock-keychain -p "$OK_KC_PASS" "$OK_KC"
  security import "$CERT_FILE" -k "$OK_KC" -P "${MAC_CERTIFICATE_PWD:-}" \
    -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild -T /usr/bin/pkgbuild > /dev/null
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$OK_KC_PASS" "$OK_KC" > /dev/null
  rm -f "$CERT_FILE"
  security list-keychains -d user -s "$OK_KC" $(security list-keychains -d user | tr -d '"') > /dev/null
  echo "==> 专用钥匙串就绪，签名身份："
  security find-identity -v -p codesigning | head -3
fi

IDENTITY_LINE="$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1)"
[ -n "$IDENTITY_LINE" ] || { echo "ERROR: 钥匙串无 Developer ID Application 身份" >&2; return 1 2>/dev/null || exit 1; }
OK_IDENTITY="$(echo "$IDENTITY_LINE" | sed -E 's/^[0-9]+\) ([0-9A-F]+) "(.*)"/\2/')"
export CSC_KEYCHAIN="${OK_KC:-$OK_TMP/openkylin-sign.keychain-db}"
export CSC_NAME="${OK_IDENTITY#Developer ID Application: }"
# CSC_LINK 路线上游缺陷（见头注）：身份经 CSC_KEYCHAIN/CSC_NAME 提供，必须摘除
unset CSC_LINK CSC_KEY_PASSWORD
echo "==> CSC_NAME=$CSC_NAME  CSC_KEYCHAIN=$CSC_KEYCHAIN"
