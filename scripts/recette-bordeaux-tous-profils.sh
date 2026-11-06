#!/usr/bin/env bash
# Recette continue; never changes domain data. Rerun whenever needed.
set -Eeuo pipefail
cd "$HOME/SATEER"
[[ "$(git branch --show-current)" == 'work/bordeaux-pilot' ]] || { echo 'STOP: mauvaise branche'; exit 1; }
export PGHOST='::1' PGPORT='5432' PGDATABASE='sateer_test' PGUSER="${PGUSER:-$USER}"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3200/login.html || true)" == '200' ]] || { echo 'STOP: serveur 3200 absent'; exit 1; }
mkdir -p "$HOME/SATEER/.sateer-backups" && chmod 700 "$HOME/SATEER/.sateer-backups"
REPORT="$HOME/SATEER/.sateer-backups/recette-multi-profils-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -m 700 "$REPORT"
export SATEER_AUDIT_REPORT="$REPORT/resultats.json"
node scripts/test-references-multi-profils.js | tee "$REPORT/references.log"
node scripts/audit-bordeaux-profils.js | tee "$REPORT/profils.log"
npm test > "$REPORT/core.log" 2>&1 || { tail -n 70 "$REPORT/core.log"; exit 1; }
tail -n 3 "$REPORT/core.log"
echo "RECETTE_BORDEAUX_PROFILS_PASS : $REPORT"
echo 'Aucun dossier ni publication créée; seules des sessions de connexion de test peuvent être ouvertes.'
