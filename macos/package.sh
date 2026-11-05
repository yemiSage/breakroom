#!/bin/bash
set -euo pipefail

project="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project"
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Build the Breakroom launcher on macOS with Xcode Command Line Tools." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) echo "Unsupported architecture." >&2; exit 1 ;;
esac

version="${BREAKROOM_NODE_VERSION:-v22.23.4}"
archive="node-$version-darwin-$arch.tar.gz"
source="https://nodejs.org/dist/$version"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

if [[ -n "${BREAKROOM_NODE_DIST:-}" ]]; then
  node_dist="$(cd "$BREAKROOM_NODE_DIST" && pwd)"
else
  curl --fail --silent --show-error --location "$source/SHASUMS256.txt" -o "$staging/SHASUMS256.txt"
  curl --fail --silent --show-error --location "$source/$archive" -o "$staging/$archive"
  awk -v archive="$archive" '$2 == archive { print; found = 1 } END { if (!found) exit 1 }' \
    "$staging/SHASUMS256.txt" > "$staging/checksum"
  (cd "$staging" && shasum -a 256 -c checksum)
  tar -xzf "$staging/$archive" -C "$staging"
  node_dist="$staging/${archive%.tar.gz}"
fi

app="$staging/Breakroom.app"
contents="$app/Contents"
resources="$contents/Resources"
mkdir -p "$contents/MacOS" "$resources/runtime" "$project/dist"
cp macos/Info.plist "$contents/Info.plist"
cp "$node_dist/bin/node" "$resources/runtime/node"
cp "$node_dist/LICENSE" "$resources/runtime/LICENSE"
cp -R public server "$resources/"
cp package.json "$resources/package.json"
xcrun clang -mmacosx-version-min=12.0 -fobjc-arc -framework Cocoa macos/Launcher.m -o "$contents/MacOS/Breakroom"
codesign --force --sign - "$resources/runtime/node"
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"

zip="$project/dist/Breakroom-macOS-$arch.zip"
ditto -c -k --norsrc --keepParent "$app" "$staging/Breakroom.zip"
mv "$staging/Breakroom.zip" "$zip"
printf '%s\n' "$zip"
