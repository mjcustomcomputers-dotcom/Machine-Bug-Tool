#!/usr/bin/env bash
# CI only: supply an actual X11 window manager to Xvfb. WebRTC's native window
# enumeration requires WM_STATE=NormalState, which an unmanaged Xvfb lacks.
# Invoke inside xvfb-run and dbus-run-session; do not alter production capture.
set -euo pipefail

mpc_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$mpc_repo_root"
mpc_smoke_output="${1:-.sites-runtime/electron-smoke}"
mkdir -p -- "$mpc_smoke_output"
: "${DISPLAY:?Run the native smoke inside xvfb-run}"
: "${DBUS_SESSION_BUS_ADDRESS:?Run the native smoke inside dbus-run-session}"
for mpc_binary in openbox xprop xdpyinfo xwininfo timeout pnpm; do
  command -v "$mpc_binary" >/dev/null || { printf 'Missing native-smoke prerequisite: %s\n' "$mpc_binary" >&2; exit 1; }
done

mpc_wm_pid=''
mpc_diagnostics() {
  local mpc_phase="$1"
  timeout 2s xdpyinfo > "$mpc_smoke_output/x11-display-$mpc_phase.txt" 2>&1 || true
  timeout 2s xprop -root > "$mpc_smoke_output/x11-root-$mpc_phase.txt" 2>&1 || true
  timeout 2s xwininfo -root -tree > "$mpc_smoke_output/x11-windows-$mpc_phase.txt" 2>&1 || true
}
mpc_cleanup() {
  local mpc_exit_status=$?
  trap - EXIT INT TERM
  mpc_diagnostics final
  if [[ -n "$mpc_wm_pid" ]]; then
    kill "$mpc_wm_pid" 2>/dev/null || true
    for mpc_attempt in {1..20}; do
      kill -0 "$mpc_wm_pid" 2>/dev/null || break
      sleep 0.05
    done
    if kill -0 "$mpc_wm_pid" 2>/dev/null; then kill -KILL "$mpc_wm_pid" 2>/dev/null || true; fi
    wait "$mpc_wm_pid" 2>/dev/null || true
  fi
  exit "$mpc_exit_status"
}
trap mpc_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

openbox --sm-disable > "$mpc_smoke_output/openbox.log" 2>&1 &
mpc_wm_pid=$!
printf 'display=%s\nwindow_manager_pid=%s\nsession_bus=%s\n' \
  "$DISPLAY" "$mpc_wm_pid" "$DBUS_SESSION_BUS_ADDRESS" > "$mpc_smoke_output/x11-session.txt"

# Each X property request has its own short deadline. The nine-second loop
# budget plus at most one 0.5s request and 0.1s pause stays below ten seconds.
mpc_wm_ready=false
mpc_ready_deadline=$((SECONDS + 9))
while (( SECONDS < mpc_ready_deadline )); do
  if ! kill -0 "$mpc_wm_pid" 2>/dev/null; then break; fi
  if mpc_wm_property="$(timeout 0.5s xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" &&
    [[ "$mpc_wm_property" =~ window\ id\ \#\ 0x([[:xdigit:]]+) ]] && [[ -n "${BASH_REMATCH[1]//0/}" ]]; then
    printf '%s\n' "$mpc_wm_property" > "$mpc_smoke_output/x11-window-manager-ready.txt"
    mpc_wm_ready=true
    break
  fi
  sleep 0.1
done
if [[ "$mpc_wm_ready" != true ]]; then
  printf 'MPC_NATIVE_SMOKE_X11_WINDOW_MANAGER_NOT_READY\n' >&2
  exit 1
fi
mpc_diagnostics ready

# pipefail preserves Electron's failure status while retaining native stderr
# (including WebRTC/X11 errors) with the existing always-uploaded receipts.
pnpm exec electron --no-sandbox --disable-gpu \
  scripts/smoke-mpc-workspace-electron.mjs --output "$mpc_smoke_output" \
  2>&1 | tee "$mpc_smoke_output/electron-process.log"
