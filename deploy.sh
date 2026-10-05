#!/usr/bin/env bash
# Ek command madhe sagla deploy: admin panel (hosting) + core + pratyek project cha backend.
#
#   ./deploy.sh                 sagla
#   ./deploy.sh hosting core    fakt nivadlele
#   ./deploy.sh noai            fakt eka project cha backend
#
# Navin project ala ki khali PROJECTS madhe ek line add kara: "<naav>:<folder>:<firebase-project-id>".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

PROJECTS=(
  "noai:$ROOT/../noai:noai-17bdc"
  # "vijaydhara:$ROOT/../vijaydhara/vijay:<firebase-project-id>"
)

# Project backend madhun kay deploy karaycha.
# firestore = rules + indexes (Dashboard che sum() indexes pan).
PROJECT_ONLY="functions,firestore,storage"

deploy_hosting() {
  echo "▶ hosting (multisarv-admin)"
  (cd "$ROOT" && firebase deploy --only hosting --project noai-17bdc)
  echo "  App: https://core.multisarv.com (web.app URL tithe redirect hoto)"
}

deploy_core() {
  echo "▶ core (multisarv-core)"
  (cd "$ROOT/core" && firebase deploy --only functions,firestore:rules,storage --project multisarv-core)
}

deploy_project() {
  local name="$1" dir="$2" id="$3"
  echo "▶ $name backend ($id)"
  [[ -f "$dir/firebase.json" ]] || { echo "  ✘ $dir/firebase.json nahi" >&2; return 1; }
  (cd "$dir" && firebase deploy --only "$PROJECT_ONLY" --project "$id")
}

targets=("$@")
[[ ${#targets[@]} -eq 0 ]] && targets=(hosting core $(for p in "${PROJECTS[@]}"; do echo "${p%%:*}"; done))

for target in "${targets[@]}"; do
  case "$target" in
    hosting) deploy_hosting ;;
    core) deploy_core ;;
    *)
      found=""
      for p in "${PROJECTS[@]}"; do
        IFS=: read -r name dir id <<<"$p"
        if [[ "$name" == "$target" ]]; then deploy_project "$name" "$dir" "$id"; found=1; fi
      done
      [[ -n "$found" ]] || { echo "✘ '$target' mahit nahi (hosting, core, kiva PROJECTS madhla naav)" >&2; exit 1; }
      ;;
  esac
done

echo "✔ Deploy purna: ${targets[*]}"
