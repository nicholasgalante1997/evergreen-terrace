#!/usr/bin/env bash
# =============================================================================
# scripts/tunnel.sh
#
# Runs on YOUR LAPTOP (client side), not on the DGX.
# Forwards all evergreen-terrace service ports over SSH so you can hit the
# dashboard from a local browser while the stack runs on the remote host.
#
# Usage:
#   ./tunnel.sh                    # uses $EVERGREEN_HOST or the default below
#   ./tunnel.sh nicks-dgx          # explicit host (matches ~/.ssh/config alias)
#   ./tunnel.sh nick@192.168.1.50  # explicit user@ip
#   ./tunnel.sh --no-open          # skip auto-opening the browser
#
# Requires ssh. Install autossh for automatic reconnection on drop:
#   macOS:  brew install autossh
#   Linux:  sudo apt install autossh
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
# Edit DEFAULT_HOST or set $EVERGREEN_HOST in your shell profile.
DEFAULT_HOST="nicks-dgx"

DASHBOARD_PORT=2728
QUEUE_PORT=2727
SENTINEL_PORT=2730
METRICS_PORT=2729
CONDUCTOR_PORT=2731

DASHBOARD_URL="http://localhost:${DASHBOARD_PORT}"

# ── Arg parsing ───────────────────────────────────────────────────────────────
HOST=""
OPEN_BROWSER=true

for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_BROWSER=false ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) HOST="$arg" ;;
  esac
done

HOST="${HOST:-${EVERGREEN_HOST:-$DEFAULT_HOST}}"

# ── Build SSH -L flags ────────────────────────────────────────────────────────
L_FLAGS=(
  -L "${DASHBOARD_PORT}:localhost:${DASHBOARD_PORT}"
  -L "${QUEUE_PORT}:localhost:${QUEUE_PORT}"
  -L "${SENTINEL_PORT}:localhost:${SENTINEL_PORT}"
  -L "${METRICS_PORT}:localhost:${METRICS_PORT}"
  -L "${CONDUCTOR_PORT}:localhost:${CONDUCTOR_PORT}"
)

SSH_OPTS=(
  -N                          # no remote command — tunnel only
  -o ServerAliveInterval=30   # send keepalive every 30s
  -o ServerAliveCountMax=4    # drop after 4 missed keepalives (~2 min)
  -o ExitOnForwardFailure=yes # fail fast if a port can't be bound locally
  -o ConnectTimeout=10        # don't hang forever on initial connect
  "${L_FLAGS[@]}"
  "$HOST"
)

# ── Print status ──────────────────────────────────────────────────────────────
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}evergreen-terrace tunnel${RESET} → ${HOST}"
echo ""
echo -e "  ${GREEN}▶${RESET}  Dashboard    ${BOLD}${DASHBOARD_URL}${RESET}"
echo -e "  ${DIM}   Queue API   http://localhost:${QUEUE_PORT}${RESET}"
echo -e "  ${DIM}   Sentinel    http://localhost:${SENTINEL_PORT}${RESET}"
echo -e "  ${DIM}   Metrics     http://localhost:${METRICS_PORT}${RESET}"
echo -e "  ${DIM}   Conductor   http://localhost:${CONDUCTOR_PORT}${RESET}"
echo ""

# ── Open browser ──────────────────────────────────────────────────────────────
if [[ "$OPEN_BROWSER" == true ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # Give SSH a moment to establish before opening
    (sleep 1.5 && open "$DASHBOARD_URL") &
  elif command -v xdg-open &>/dev/null; then
    (sleep 1.5 && xdg-open "$DASHBOARD_URL") &
  fi
fi

# ── Connect ───────────────────────────────────────────────────────────────────
if command -v autossh &>/dev/null; then
  echo -e "Using ${BOLD}autossh${RESET} (reconnects automatically on drop). Ctrl+C to stop."
  echo ""
  # AUTOSSH_GATETIME=0: don't kill autossh if the connection drops within the
  # first few seconds (useful when the remote stack is still starting up)
  AUTOSSH_GATETIME=0 autossh -M 0 "${SSH_OPTS[@]}"
else
  echo -e "Using ${BOLD}ssh${RESET}. Ctrl+C to stop."
  echo -e "${DIM}Tip: brew install autossh  for automatic reconnection on drop.${RESET}"
  echo ""
  ssh "${SSH_OPTS[@]}"
fi
