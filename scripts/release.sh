#!/usr/bin/env bash
# Tag and release the version in package.json, following .github/RELEASING.md.
#
#   scripts/release.sh             check everything, ask once, then tag and release
#   scripts/release.sh --dry-run   show what would happen and change nothing
#   scripts/release.sh --yes       don't ask for confirmation
#   scripts/release.sh --skip-ci   don't require GitHub's checks on this commit
#   scripts/release.sh --test      also run `npm test` locally first
#
# What it does:
#   1. Checks you are on an up-to-date, clean main, and that the tag is new.
#   2. Takes the release title and notes from the matching CHANGELOG.md section.
#   3. Creates and pushes the version tag (for example v5.5.0).
#   4. Creates the GitHub release.
#   5. Moves the major tag (for example v5) to this release, which is what
#      README workflows use.
#
# Needs: git, node, and the GitHub CLI (gh), signed in with push access.
set -euo pipefail

DRY=0 YES=0 SKIP_CI=0 RUN_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --yes|-y) YES=1 ;;
    --skip-ci) SKIP_CI=1 ;;
    --test) RUN_TESTS=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mStopped:\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then printf '  would run: %s\n' "$*"; else "$@"; fi; }

cd "$(git rev-parse --show-toplevel)"
for tool in git node gh; do command -v "$tool" >/dev/null || fail "$tool is not installed."; done
gh auth status >/dev/null 2>&1 || fail "The GitHub CLI is not signed in. Run: gh auth login"

REMOTE=origin
VERSION=$(node -p "require('./package.json').version")
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "package.json version '$VERSION' is not a plain x.y.z version."
TAG="v$VERSION"
MAJOR="v${VERSION%%.*}"

say "Checking the repository"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = main ] || fail "You are on '$BRANCH'. Switch to main first."
[ -z "$(git status --porcelain)" ] || fail "There are uncommitted changes. Commit or stash them first."
git fetch --quiet --tags "$REMOTE"
HEAD_SHA=$(git rev-parse HEAD)
[ "$HEAD_SHA" = "$(git rev-parse "$REMOTE/main")" ] || fail "Local main and $REMOTE/main differ. Pull (or push) first."
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || [ -n "$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG")" ]; then
  fail "$TAG already exists. Raise the version in package.json and CHANGELOG.md, or release that tag by hand."
fi
echo "  main at ${HEAD_SHA:0:7}, clean and up to date. $TAG is new."

# The packages built from this repository must carry the same version.
for package in packages/core packages/web-component; do
  if [ -f "$package/package.json" ]; then
    FOUND=$(node -p "require('./$package/package.json').version")
    [ "$FOUND" = "$VERSION" ] || fail "$package is at $FOUND, not $VERSION. Run: npm run build:core && npm run build:extensions"
  fi
done

say "Reading the release notes"
HEADING=$(grep -m1 -E "^## ${VERSION//./\\.}( |$)" CHANGELOG.md || true)
[ -n "$HEADING" ] || fail "CHANGELOG.md has no '## $VERSION' section."
NAME=${HEADING#"## $VERSION"}
NAME=${NAME# }
for separator in "— " "– " "- "; do NAME=${NAME#"$separator"}; done
TITLE="$TAG${NAME:+ — $NAME}"
NOTES=$(mktemp)
trap 'rm -f "$NOTES"' EXIT
awk -v heading="$HEADING" '
  $0 == heading { inside = 1; next }
  inside && /^## / { exit }
  inside { print }
' CHANGELOG.md | sed -e '/./,$!d' > "$NOTES"
[ -s "$NOTES" ] || fail "The '## $VERSION' section of CHANGELOG.md is empty."
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
printf '\nFull history: [CHANGELOG.md](https://github.com/%s/blob/main/CHANGELOG.md)\n' "$REPO" >> "$NOTES"
echo "  Title: $TITLE"
echo "  Notes: $(grep -c '^- ' "$NOTES" || true) entries from CHANGELOG.md"

if [ "$SKIP_CI" = 0 ]; then
  say "Checking GitHub's tests on this commit"
  CHECKS=$(gh api "repos/$REPO/commits/$HEAD_SHA/check-runs" --paginate -q '.check_runs[] | "\(.status) \(.conclusion) \(.name)"')
  [ -n "$CHECKS" ] || fail "No checks have run on ${HEAD_SHA:0:7} yet. Wait for them, or pass --skip-ci."
  if printf '%s\n' "$CHECKS" | grep -qv '^completed '; then
    printf '%s\n' "$CHECKS" | sed 's/^/  /'
    fail "Checks are still running. Wait for them, or pass --skip-ci."
  fi
  if printf '%s\n' "$CHECKS" | grep -qvE '^completed (success|skipped|neutral) '; then
    printf '%s\n' "$CHECKS" | sed 's/^/  /'
    fail "A check did not pass on this commit."
  fi
  echo "  All $(printf '%s\n' "$CHECKS" | wc -l | tr -d ' ') checks passed."
fi

if [ "$RUN_TESTS" = 1 ]; then
  say "Running npm test"
  run npm test
fi

OLD_MAJOR=$(git ls-remote --tags "$REMOTE" "refs/tags/$MAJOR" | cut -f1)
say "Ready to release"
echo "  Tag      $TAG at ${HEAD_SHA:0:7}"
echo "  Release  $TITLE"
if [ -n "$OLD_MAJOR" ]; then echo "  Move     $MAJOR from ${OLD_MAJOR:0:7} to ${HEAD_SHA:0:7}"
else echo "  Create   $MAJOR at ${HEAD_SHA:0:7} (it does not exist yet)"; fi
if [ "$DRY" = 0 ] && [ "$YES" = 0 ]; then
  read -r -p "Go ahead? [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "Nothing was changed."; exit 0 ;; esac
fi

say "Tagging $TAG"
run git tag -a "$TAG" -m "$TITLE" "$HEAD_SHA"
run git push "$REMOTE" "refs/tags/$TAG"

say "Creating the GitHub release"
run gh release create "$TAG" --verify-tag --title "$TITLE" --notes-file "$NOTES" --latest

# The major tag is the one README workflows use. It moves; version tags never do.
say "Pointing $MAJOR at this release"
run git tag -f "$MAJOR" "$HEAD_SHA"
if [ -n "$OLD_MAJOR" ]; then
  # Refuse to overwrite if someone moved it since we looked.
  run git push "$REMOTE" "refs/tags/$MAJOR" "--force-with-lease=refs/tags/$MAJOR:$OLD_MAJOR"
else
  run git push "$REMOTE" "refs/tags/$MAJOR"
fi

if [ "$DRY" = 1 ]; then
  say "Dry run finished. Nothing was changed."
  exit 0
fi

say "Released $TAG"
cat <<EOF
  Release:  https://github.com/$REPO/releases/tag/$TAG

Still to do by hand:
  1. Marketplace: open the release on GitHub, choose Edit, tick
     "Publish this Action to the GitHub Marketplace", and save. The command
     line cannot do this.
  2. Check that $REPO@$MAJOR works: run a profile workflow and look at
     the image it publishes.
EOF
