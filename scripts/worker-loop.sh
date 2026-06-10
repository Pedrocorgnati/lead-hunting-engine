#!/usr/bin/env sh
# Worker loop do container Dockerfile.workers: drena a local-queue do app
# (coleta, process-leads, exports, budgetflow) chamando o endpoint de drain
# autenticado por CRON_SECRET, e escreve o heartbeat consumido pelo
# HEALTHCHECK. Sem APP_URL/CRON_SECRET o loop falha explicito (exit 1) —
# nunca um stub silencioso.
set -eu

: "${APP_URL:?APP_URL obrigatorio (ex: http://app:3000)}"
: "${CRON_SECRET:?CRON_SECRET obrigatorio (mesmo valor do app)}"
INTERVAL="${DRAIN_INTERVAL_SECONDS:-30}"

echo "[worker-loop] iniciando: drain a cada ${INTERVAL}s contra ${APP_URL}"

while true; do
  if curl -sf -X POST "${APP_URL}/api/cron/drain-local-queue" \
      -H "authorization: Bearer ${CRON_SECRET}" \
      -o /tmp/last-drain.json; then
    touch /tmp/worker-heartbeat
  else
    echo "[worker-loop] drain falhou ($(date -u +%FT%TZ)); heartbeat NAO atualizado" >&2
  fi
  sleep "${INTERVAL}"
done
