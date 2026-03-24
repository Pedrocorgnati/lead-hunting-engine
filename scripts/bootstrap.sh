#!/usr/bin/env bash
# bootstrap.sh — Setup completo do ambiente local
# Gerado por /dev-bootstrap-create (SystemForge)
# Uso: ./scripts/bootstrap.sh [--reset|--health]
set -euo pipefail

# === Cores ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[bootstrap]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[erro]${NC} $*" >&2; }

# === Pre-requisitos ===
check_prereqs() {
  local missing=()

  for cmd in git node npm docker; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done

  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    if ! grep -q "^docker" <(printf '%s\n' "${missing[@]:-}"); then
      missing+=("docker-compose")
    fi
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    err "Faltando pre-requisitos: ${missing[*]}"
    err "Instale os seguintes e tente novamente:"
    err "  - git"
    err "  - node (v20+)"
    err "  - npm"
    err "  - docker"
    err "  - docker compose (v2+)"
    exit 1
  fi

  ok "Pre-requisitos verificados"
}

# === .env ===
ensure_env() {
  if [ -f .env ]; then
    ok ".env ja existe"
    return
  fi

  if [ -f .env.example ]; then
    cp .env.example .env
    ok ".env criado a partir de .env.example"
    warn "Revise .env e preencha valores sensiveis (APIs, conexoes de DB) antes de continuar"
    return
  fi

  warn ".env nao encontrado. Configure manualmente ou execute /env-creation"
}

# === Dependencias ===
install_deps() {
  log "Instalando dependencias..."

  if [ ! -d node_modules ]; then
    npm install
    ok "Dependencias instaladas"
  else
    ok "node_modules ja existe"
    npm ci
  fi
}

# === Docker ===
start_services() {
  log "Subindo servicos Docker (PostgreSQL + Redis)..."

  if docker compose ps --format json 2>/dev/null | grep -q '"State":"running"'; then
    ok "Servicos ja estao rodando"
    return
  fi

  docker compose up -d

  log "Aguardando servicos ficarem healthy..."
  local max_wait=60
  local waited=0

  while [ $waited -lt $max_wait ]; do
    if docker compose ps --format json 2>/dev/null | jq -e 'map(select(.Health | test("healthy|\"running\""))) | length > 0' >/dev/null 2>&1; then
      ok "Servicos Docker rodando e saudaveis"
      return
    fi
    sleep 2
    waited=$((waited + 2))
  done

  warn "Timeout esperando servicos ficarem healthy (${max_wait}s)"
  warn "Verifique com: docker compose ps"
  warn "Logs: docker compose logs -f"
}

stop_services() {
  log "Parando servicos Docker..."
  docker compose down
  ok "Servicos parados"
}

# === Migrations ===
run_migrations() {
  log "Executando migrations Prisma..."

  npx prisma migrate deploy
  ok "Migrations aplicadas com sucesso"
}

# === Seeds ===
run_seeds() {
  log "Executando seeds de desenvolvimento..."

  npm run seed:dev
  ok "Seeds carregados"
}

# === Health Check (leve) ===
check_health() {
  log "Verificando saude do ambiente..."
  local errors=0

  # .env
  if [ -f .env ]; then
    ok ".env presente"
  else
    warn ".env ausente"
    errors=$((errors + 1))
  fi

  # node_modules
  if [ -d node_modules ]; then
    ok "node_modules presente"
  else
    warn "node_modules ausente"
    errors=$((errors + 1))
  fi

  # Docker
  if docker compose ps --format json 2>/dev/null | jq -e 'map(select(.State == "running")) | length > 0' >/dev/null 2>&1; then
    ok "Containers rodando"
  else
    warn "Containers nao estao rodando"
    warn "Dica: docker compose up -d"
    errors=$((errors + 1))
  fi

  # Prisma
  if [ -f prisma/schema.prisma ]; then
    ok "Prisma schema presente"
    # Tentar conexao (leve)
    if npx prisma db execute --stdin <<< "SELECT 1" >/dev/null 2>&1; then
      ok "Banco de dados acessivel"
    else
      warn "Nao foi possivel conectar ao banco (verifique DATABASE_URL)"
      errors=$((errors + 1))
    fi
  fi

  echo ""
  if [ $errors -eq 0 ]; then
    ok "Ambiente completamente saudavel"
    return 0
  else
    warn "$errors problema(s) encontrado(s)"
    return 1
  fi
}

# === Summary ===
show_summary() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  BOOTSTRAP COMPLETO ✓${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  📦 Ambiente pronto para desenvolvimento"
  echo ""
  echo "  Para iniciar o dev server:"
  echo "    ${BLUE}npm run dev${NC}           ou   ${BLUE}make dev${NC}"
  echo ""
  echo "  Para parar servicos Docker:"
  echo "    ${BLUE}docker compose down${NC}"
  echo ""
  echo "  Para rodar testes:"
  echo "    ${BLUE}npm test${NC}              ou   ${BLUE}make test${NC}"
  echo ""
  echo "  Para resetar tudo (development fresh):"
  echo "    ${BLUE}./scripts/bootstrap.sh --reset${NC}   ou   ${BLUE}make reset${NC}"
  echo ""
  echo "  Status:"
  echo "    ${BLUE}./scripts/bootstrap.sh --health${NC}"
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# === Reset ===
do_reset() {
  warn "Resetando ambiente (tudo sera deletado)..."
  echo ""

  stop_services
  warn "Deletando node_modules..."
  rm -rf node_modules .next dist build 2>/dev/null || true

  warn "Resetando .env..."
  rm -f .env 2>/dev/null || true

  ok "Ambiente limpo"
  echo ""

  log "Recriando do zero..."
  do_setup
}

# === Setup Principal ===
do_setup() {
  log "Iniciando bootstrap de lead-hunting-engine..."
  echo ""

  check_prereqs
  ensure_env
  install_deps
  start_services
  run_migrations
  run_seeds
  check_health
  show_summary
}

# === Entrypoint ===
cd "$(dirname "${BASH_SOURCE[0]}")/.."

case "${1:-}" in
  --reset)  do_reset ;;
  --health) check_health ;;
  *)        do_setup ;;
esac
