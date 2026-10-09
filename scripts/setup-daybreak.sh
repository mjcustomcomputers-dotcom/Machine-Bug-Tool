#!/usr/bin/env bash
# Prepare a Linux/macOS source checkout; this does not publish a Cloud environment.
set -euo pipefail

daybreak_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "${daybreak_script_dir}/.."

daybreak_required_pnpm="$(node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const requirement = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(manifest.engines?.node ?? '');
if (!requirement) throw new Error('Review the manifest Node requirement before setup.');
const minimum = requirement.slice(1).map(Number);
const actual = process.versions.node.split('.').map(Number);
const firstDifference = actual.findIndex((value, index) => value !== minimum[index]);
if (firstDifference !== -1 && actual[firstDifference] < minimum[firstDifference]) {
  throw new Error(`Node ${manifest.engines.node} is required; found ${process.version}.`);
}
const manager = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
if (!manager) throw new Error('Review the manifest package-manager pin before setup.');
process.stdout.write(manager[1]);
NODE
)"

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'Provide pnpm %s through your environment tooling, then rerun setup.\n' "${daybreak_required_pnpm}" >&2
  exit 69
fi
daybreak_actual_pnpm="$(pnpm --version)"
if [[ "${daybreak_actual_pnpm}" != "${daybreak_required_pnpm}" ]]; then
  printf 'Required pnpm %s; found %s. Keep the repository pin.\n' "${daybreak_required_pnpm}" "${daybreak_actual_pnpm}" >&2
  exit 69
fi

daybreak_profile="$(node --input-type=module -e "import { readExecutionProfile } from './scripts/execution-profile.mjs'; process.stdout.write(readExecutionProfile());")"
if [[ "${daybreak_profile}" != portable ]]; then
  printf 'This entry point prepares portable checkouts. Use the existing Sites dependency workflow for %s.\n' "${daybreak_profile}" >&2
  exit 78
fi

printf 'Preparing portable source checkout with Node %s and pnpm %s.\n' "$(node --version)" "${daybreak_actual_pnpm}"
pnpm install --prod=false --ignore-scripts=false --frozen-lockfile --prefer-offline
node --test
npm run build
printf '\nSource dependency installation, tests, and build passed in this checkout.\n'
