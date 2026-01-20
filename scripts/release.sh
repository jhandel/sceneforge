#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/sceneforge"
PACKAGE_README="$PACKAGE_DIR/README.md"
ROOT_README="$ROOT_DIR/README.md"

VERSION="${1:-}"
TAG="${2:-latest}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $(basename "$0") <version> [tag]"
  echo "Example: $(basename "$0") 1.0.1 next"
  exit 1
fi

if [[ ! -d "$PACKAGE_DIR" ]]; then
  echo "Could not find package dir: $PACKAGE_DIR"
  exit 1
fi

cd "$ROOT_DIR"

echo "[release] Building @t3lnet/sceneforge..."
bun run build:sceneforge

cd "$PACKAGE_DIR"

TEMP_README=""
if [[ -f "$ROOT_README" ]]; then
  if [[ -f "$PACKAGE_README" ]]; then
    TEMP_README="$(mktemp)"
    cp "$PACKAGE_README" "$TEMP_README"
  else
    TEMP_README="__DELETE__"
  fi
  cp "$ROOT_README" "$PACKAGE_README"
fi

cleanup_readme() {
  if [[ "$TEMP_README" == "__DELETE__" ]]; then
    rm -f "$PACKAGE_README"
  elif [[ -n "$TEMP_README" && -f "$TEMP_README" ]]; then
    mv "$TEMP_README" "$PACKAGE_README"
  fi
}
trap cleanup_readme EXIT

if ! npm --workspaces=false whoami >/dev/null 2>&1; then
  echo "[release] npm auth missing. Run:"
  echo "  npm --workspaces=false config set //registry.npmjs.org/:_authToken=YOUR_TOKEN"
  exit 1
fi

echo "[release] Setting version to $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version --workspaces=false

echo "[release] Publishing @t3lnet/sceneforge@$VERSION (tag: $TAG)"
npm publish --access public --tag "$TAG"

echo "[release] Done. Suggested follow-up:"
cat <<'NEXT'
  git add packages/sceneforge/package.json
  git commit -m "chore(release): v$VERSION"
  git tag v$VERSION
  git push --tags
NEXT
