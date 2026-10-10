#!/usr/bin/env bash
# Standalone, authenticated FrontierOR PUBLIC test bridge.
# Operates only in an already initialized organizer starter Codespace.
# Does not submit, print API keys, change the MPC main branch or call LLMs.
set -euo pipefail

ROOT="$PWD"
while [[ "$ROOT" != "/" && ! -f "$ROOT/frontieror.toml" ]]; do
  ROOT="$(dirname "$ROOT")"
done
if [[ ! -f "$ROOT/frontieror.toml" ]]; then
  echo "STOP: open the already initialized FrontierOR starter terminal; frontieror.toml not found."
  exit 2
fi
cd "$ROOT"
if ! command -v uv >/dev/null 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "STOP: uv was not found in this Codespace."
  exit 2
fi

# Reads the organizer's own locally saved .env. The token stays private.
uv run python - <<'PY'
from pathlib import Path
from frontieror.config import load_env
from frontieror.api import api
load_env(Path.cwd())
me=api.me()
team=me.get("team") or {}
track=str(team.get("track","")).lower()
print("Authenticated FrontierOR team:",team.get("name","<none>"),"track:",track)
if track!="main":
    raise SystemExit("STOP: authenticated team is not on the Main track.")
PY

SLUGS=(barnhart2000 bodur2017 cordeau2006 fischetti1998 hoffman1993 nagy2015)
for slug in "${SLUGS[@]}"; do
  if [[ ! -f "data/problems/$slug/problem.json" ]]; then
    echo "STOP: Missing official public problem $slug. Run 'uv run frontieror init' in this starter first."
    exit 3
  fi
done

echo "Installing six verified competition solver sources from GitHub..."
BACKUP="runs/frontieror-previous-solvers/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BASE="https://raw.githubusercontent.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/frontieror-darp-testing-20261010/frontieror/solvers"
for slug in "${SLUGS[@]}"; do
  mkdir -p "$TMP/$slug"
  curl --fail --location --silent --show-error --retry 2 --max-time 30 \
    "$BASE/$slug/solve.py" -o "$TMP/$slug/solve.py"
  python -m py_compile "$TMP/$slug/solve.py"
done
for slug in "${SLUGS[@]}"; do
  mkdir -p "solvers/$slug" "$BACKUP/$slug"
  if [[ -f "solvers/$slug/solve.py" ]]; then
    cp "solvers/$slug/solve.py" "$BACKUP/$slug/solve.py"
  fi
  cp "$TMP/$slug/solve.py" "solvers/$slug/solve.py"
  printf '%s  %s\n' "$(sha256sum "solvers/$slug/solve.py" | cut -d' ' -f1)" "$slug/solve.py"
done

echo
echo "Running organizer toolkit on all six real public instances..."
uv run frontieror test
echo
echo "FINISHED: tests ran, NO competition submission was sent."
echo "If the toolkit reports failures, save its terminal output for solver repair."
