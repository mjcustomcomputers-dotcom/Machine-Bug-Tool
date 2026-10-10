#!/bin/sh
set -eu
mpc_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$mpc_script_dir"
exec node scripts/start-mpc-local-chat.mjs "$@"
