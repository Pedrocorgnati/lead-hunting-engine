#!/usr/bin/env bash
# TASK-20/ST002 (CL-510): Rollback seguro de migrations Prisma.
# Uso:
#   DATABASE_URL=... ./scripts/db-rollback.sh [--steps N] [--dry-run]
#
# Detecta se o DATABASE_URL aponta para Supabase managed e orienta PITR
# (nao ha acesso direto pg_dump). Em DB direto, faz backup + rollback
# incremental via `prisma migrate resolve --rolled-back`.
#
# IMPORTANTE: este script NAO reverte o schema em si — Prisma nao tem
# "down migration" automatica. O rollback marca a migration como
# revertida e o operador deve: (1) restore do backup, OU (2) criar
# migration compensatoria. Ver docs/runbooks/migrations-rollback.md.
set -euo pipefail

STEPS=1
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --steps)
      STEPS="$2"
      shift 2
      ;;
    --steps=*)
      STEPS="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--steps N] [--dry-run]"
      echo "  --steps N   Numero de migrations a reverter (default: 1)"
      echo "  --dry-run   Apenas imprime o que faria, sem executar"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL nao definido" >&2
  exit 1
fi

echo "==> db-rollback.sh — steps=$STEPS dry-run=${DRY_RUN:-0}"

# --- Branch 1: Supabase managed ---------------------------------------
if [[ "$DATABASE_URL" == *"supabase.co"* ]] || [[ "$DATABASE_URL" == *"supabase.com"* ]]; then
  cat <<'EOF'

Supabase managed detectado — pg_dump direto NAO e suportado.

Use Point-In-Time Recovery (PITR) via Supabase Dashboard ou CLI:

  Dashboard: Project → Database → Backups → "Restore to point-in-time"
  CLI:       supabase db backups restore --project <PROJECT_REF> --timestamp <ISO8601>

Janela PITR padrao: 7 dias no plano Pro (14+ no Team/Enterprise).
Ver docs/runbooks/backup-restore-pitr.md para procedimento completo.

Para marcar migrations como rolled-back no registro do Prisma (sem restore):

EOF
  if [[ -z "$DRY_RUN" ]]; then
    mapfile -t APPLIED < <(npx prisma migrate status --schema prisma/schema.prisma 2>/dev/null | grep -E "^\s*- " | awk '{print $2}' || true)
    if [[ ${#APPLIED[@]} -eq 0 ]]; then
      echo "Nao foi possivel listar migrations aplicadas via prisma CLI." >&2
      exit 1
    fi
    TARGETS=("${APPLIED[@]: -$STEPS}")
    for M in "${TARGETS[@]}"; do
      echo "  npx prisma migrate resolve --rolled-back $M"
    done
    echo ""
    echo "Execute os comandos acima APOS o restore PITR concluir."
  else
    echo "  (dry-run) listaria as ultimas $STEPS migrations e geraria comandos resolve."
  fi
  exit 0
fi

# --- Branch 2: DB direto ---------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d%H%M%S).sql"

if [[ -n "$DRY_RUN" ]]; then
  echo "(dry-run) pg_dump \"\$DATABASE_URL\" > $BACKUP_FILE"
  echo "(dry-run) identificaria ultimas $STEPS migrations aplicadas"
  echo "(dry-run) executaria: prisma migrate resolve --rolled-back <migration> por cada"
  exit 0
fi

echo "==> Backup em $BACKUP_FILE"
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

echo "==> Listando migrations aplicadas"
mapfile -t APPLIED < <(npx prisma migrate status --schema prisma/schema.prisma 2>/dev/null | grep -E "^\s*- " | awk '{print $2}' || true)
if [[ ${#APPLIED[@]} -eq 0 ]]; then
  echo "Nao foi possivel listar migrations aplicadas" >&2
  exit 1
fi

TARGETS=("${APPLIED[@]: -$STEPS}")
echo "==> Rollback de ${#TARGETS[@]} migration(s):"
for M in "${TARGETS[@]}"; do
  echo "   - $M"
done

for M in "${TARGETS[@]}"; do
  npx prisma migrate resolve --rolled-back "$M"
done

echo "==> Rollback concluido. Backup em $BACKUP_FILE"
echo ""
echo "ATENCAO: o schema fisico NAO foi revertido automaticamente."
echo "Para reverter o schema, opcoes:"
echo "  1. Restore do backup: psql \$DATABASE_URL < $BACKUP_FILE"
echo "  2. Criar migration compensatoria: prisma migrate dev --name revert_<feature>"
