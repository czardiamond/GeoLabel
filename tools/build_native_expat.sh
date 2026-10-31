#!/usr/bin/env bash
# Rebuild the small native dependency missing from the Vercel Python runtime.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
test "$(uname -s)" = Linux && test "$(uname -m)" = x86_64 || {
  echo 'Build this artifact on Linux x86_64 for the Vercel runtime.' >&2; exit 1;
}
VERSION=2.9.0
URL=https://github.com/libexpat/libexpat/releases/download/R_2_9_0/expat-2.9.0.tar.xz
SOURCE_SHA256=1e6371862cc31999b368c3b89b49994f0677e1bab5f1b2b85ae3741f5d803051
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
curl --fail --silent --show-error --location "$URL" -o "$BUILD/source.tar.xz"
printf '%s  %s\n' "$SOURCE_SHA256" "$BUILD/source.tar.xz" | sha256sum --check --status
tar -xJf "$BUILD/source.tar.xz" -C "$BUILD"
cd "$BUILD/expat-$VERSION"
echo 'Configuring verified Expat source for the Linux x86_64 runtime...'
./configure --enable-shared --disable-static --without-xmlwf --without-examples \
  --without-tests --without-docbook --without-arc4random --without-arc4random-buf \
  --without-getentropy --with-getrandom CFLAGS='-O2 -fPIC -std=c99 -U_FORTIFY_SOURCE' \
  > "$BUILD/build.log" 2>&1
make -j2 >> "$BUILD/build.log" 2>&1 || { tail -40 "$BUILD/build.log" >&2; exit 1; }
mkdir -p "$ROOT/backend/native"
cp -L lib/.libs/libexpat.so.1 "$ROOT/backend/native/libexpat.so.1"
strip --strip-unneeded "$ROOT/backend/native/libexpat.so.1"
cp COPYING "$ROOT/backend/native/EXPAT-LICENSE"
python3 - "$ROOT/backend/native/libexpat.so.1" <<'PY'
import re, subprocess, sys
versions = re.findall(r'GLIBC_(\d+)\.(\d+)', subprocess.check_output(
    ['readelf', '--version-info', sys.argv[1]], text=True))
if not versions or max(tuple(map(int, value)) for value in versions) > (2, 34):
    raise SystemExit('The native artifact requires glibc newer than the supported runtime.')
print('Native compatibility gate passed (glibc <= 2.34).')
PY
cd "$ROOT/backend/native"
sha256sum libexpat.so.1 > libexpat.sha256
echo 'Built the licensed, checksum-recorded backend/native/libexpat.so.1 artifact.'
