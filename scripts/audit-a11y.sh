#!/usr/bin/env bash
# scripts/audit-a11y.sh — Audit de acessibilidade (WCAG 2.1 AA) das paginas de auth.
#
# Resolve pending action: M2-4 (G2-003)
#
# Pre-requisitos:
#   1. App rodando em http://localhost:3000 (npm run start ou npm run dev)
#   2. Token de convite valido (para auditar /invite/{token})
#   3. Node + npx (axe-core sera baixado on-the-fly via npx)
#
# Uso:
#   bash scripts/audit-a11y.sh                          # localhost + sem token
#   bash scripts/audit-a11y.sh --token <uuid>           # localhost + invite real
#   bash scripts/audit-a11y.sh --base http://stg/       # staging
#
# Saida: output/wbs/lead-hunting-engine/A11Y-AUTH-REPORT.md
# Exit code: 0 = nenhuma violacao SERIA/CRITICAL, 1 = violacoes detectadas

set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
INVITE_TOKEN="${INVITE_TOKEN:-}"
OUTDIR_DEFAULT="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)/output/wbs/lead-hunting-engine"
OUTDIR="${OUTDIR:-$OUTDIR_DEFAULT}"
REPORT="${OUTDIR}/A11Y-AUTH-REPORT.md"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --token) INVITE_TOKEN="$2"; shift 2 ;;
    --out) OUTDIR="$2"; REPORT="${OUTDIR}/A11Y-AUTH-REPORT.md"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUTDIR"

# ─── Paginas a auditar ────────────────────────────────────────────────────────
PAGES=(
  "/login"
  "/auth/reset-password"
  "/auth/reset-password/update"
  "/termos"
)
if [[ -n "$INVITE_TOKEN" ]]; then
  PAGES+=("/invite/${INVITE_TOKEN}")
fi

# ─── Pre-flight ───────────────────────────────────────────────────────────────
echo "━━━ audit-a11y.sh — BASE=${BASE} ━━━"
if ! curl -fs -o /dev/null "${BASE}/login" 2>/dev/null; then
  echo "ERRO: ${BASE}/login nao respondeu. Suba o app antes (npm run dev ou npm run start)." >&2
  exit 2
fi

# Cache do axe-core CLI no diretorio do projeto para nao baixar a cada run.
# `@axe-core/cli` provê o binario `axe`.
if ! command -v npx >/dev/null 2>&1; then
  echo "ERRO: npx nao disponivel. Instale Node.js." >&2
  exit 2
fi

# ─── Loop por pagina ──────────────────────────────────────────────────────────
TOTAL_VIOLATIONS=0
TOTAL_SERIOUS=0
TOTAL_CRITICAL=0
TOTAL_PAGES=0
PAGE_SUMMARIES=()

for path in "${PAGES[@]}"; do
  url="${BASE}${path}"
  TOTAL_PAGES=$((TOTAL_PAGES+1))
  outfile="${TMPDIR}/$(echo "$path" | tr '/' '_').json"
  echo ""
  echo "▶ Auditando ${url}"

  # Verifica se a pagina retorna 200 antes de auditar — paginas que redirecionam
  # ou retornam 404 geram axe output vazio e podem mascarar problemas.
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 0 "$url" 2>/dev/null)
  if [[ "$http_code" != "200" ]]; then
    echo "  ERRO: ${url} retornou HTTP ${http_code} (esperado 200). Marcando como FAIL."
    TOTAL_VIOLATIONS=$((TOTAL_VIOLATIONS+1))
    TOTAL_CRITICAL=$((TOTAL_CRITICAL+1))
    PAGE_SUMMARIES+=("${path}|FAIL-HTTP|HTTP ${http_code}|1|0|1")
    continue
  fi

  # Pin de versao explicito — reprodutibilidade entre runs e CI.
  # Cliente DEVE ter @axe-core/cli como devDependency:
  #   npm i -D @axe-core/cli@4.10.2
  AXE_VERSION="${AXE_VERSION:-4.10.2}"
  if ! npx --no-install @axe-core/cli@${AXE_VERSION} \
      "$url" \
      --tags wcag2a,wcag2aa,best-practice \
      --save "$outfile" \
      --exit \
      > "${TMPDIR}/axe-stdout.log" 2>&1; then
    # axe --exit retorna nao-zero quando ha violacoes — comportamento esperado.
    # Mas se nao foi instalado (--no-install bloqueou), e ERROR real.
    if grep -q "could not determine executable" "${TMPDIR}/axe-stdout.log" 2>/dev/null \
       || grep -q "Cannot find module" "${TMPDIR}/axe-stdout.log" 2>/dev/null; then
      echo "  ERRO: @axe-core/cli@${AXE_VERSION} nao instalado. Rode: npm i -D @axe-core/cli@${AXE_VERSION}"
      TOTAL_VIOLATIONS=$((TOTAL_VIOLATIONS+1))
      TOTAL_CRITICAL=$((TOTAL_CRITICAL+1))
      PAGE_SUMMARIES+=("${path}|FAIL-DEP|axe-cli ausente|1|0|1")
      continue
    fi
  fi

  if [[ ! -s "$outfile" ]]; then
    echo "  ERRO: axe-cli nao gerou output em ${url}. Marcando como FAIL."
    TOTAL_VIOLATIONS=$((TOTAL_VIOLATIONS+1))
    TOTAL_CRITICAL=$((TOTAL_CRITICAL+1))
    PAGE_SUMMARIES+=("${path}|FAIL-EMPTY|axe-cli output vazio|1|0|1")
    continue
  fi

  # Extrair contagens via node (ja garantimos npx)
  read v_total v_serious v_critical < <(node -e "
    const data = JSON.parse(require('fs').readFileSync('$outfile','utf8'));
    const violations = (data[0]||data).violations || [];
    let total=0, serious=0, critical=0;
    for (const v of violations) {
      const n = (v.nodes||[]).length;
      total += n;
      if (v.impact === 'serious') serious += n;
      if (v.impact === 'critical') critical += n;
    }
    console.log(total, serious, critical);
  " 2>/dev/null)

  v_total=${v_total:-0}; v_serious=${v_serious:-0}; v_critical=${v_critical:-0}
  TOTAL_VIOLATIONS=$((TOTAL_VIOLATIONS + v_total))
  TOTAL_SERIOUS=$((TOTAL_SERIOUS + v_serious))
  TOTAL_CRITICAL=$((TOTAL_CRITICAL + v_critical))

  if [[ "$v_critical" -gt 0 ]]; then status="CRITICAL"
  elif [[ "$v_serious" -gt 0 ]]; then status="SERIOUS"
  elif [[ "$v_total" -gt 0 ]]; then status="MINOR"
  else status="CLEAN"
  fi

  echo "  Status: ${status} (total=${v_total}, serious=${v_serious}, critical=${v_critical})"
  PAGE_SUMMARIES+=("${path}|${status}|${url}|${v_total}|${v_serious}|${v_critical}")

  # Copia o JSON detalhado para o OUTDIR para inspecao posterior.
  cp "$outfile" "${OUTDIR}/a11y-$(echo "$path" | tr '/' '_').json"
done

# ─── Relatorio ────────────────────────────────────────────────────────────────
{
  echo "# A11Y-AUTH-REPORT — Milestone 2 (M2-4 / G2-003)"
  echo ""
  echo "**Data:** $(date -Iseconds)"
  echo "**BASE:** \`${BASE}\`"
  echo "**Tags axe-core:** wcag2a, wcag2aa, best-practice"
  echo ""
  echo "## Resumo Consolidado"
  echo ""
  echo "| Metrica | Total |"
  echo "|---------|-------|"
  echo "| Paginas auditadas | ${TOTAL_PAGES} |"
  echo "| Violacoes total | ${TOTAL_VIOLATIONS} |"
  echo "| Violacoes serias | ${TOTAL_SERIOUS} |"
  echo "| Violacoes criticas | ${TOTAL_CRITICAL} |"
  echo ""
  if [[ $TOTAL_CRITICAL -eq 0 && $TOTAL_SERIOUS -eq 0 ]]; then
    echo "**Veredicto:** APROVADO (zero violacoes serias/criticas)"
  else
    # WCAG 2.1 AA nao tolera serious nem critical para conformidade.
    echo "**Veredicto:** REPROVADO (${TOTAL_CRITICAL} critica(s) + ${TOTAL_SERIOUS} seria(s) — WCAG 2.1 AA exige zero das duas)"
  fi
  echo ""
  echo "## Detalhamento por Pagina"
  echo ""
  echo "| Path | Status | Total | Serious | Critical | Detalhes JSON |"
  echo "|------|--------|-------|---------|----------|---------------|"
  for s in "${PAGE_SUMMARIES[@]}"; do
    IFS='|' read -r path st url tt sr cr <<< "$s"
    json_name="a11y-$(echo "$path" | tr '/' '_').json"
    echo "| \`${path}\` | ${st} | ${tt} | ${sr} | ${cr} | [\`${json_name}\`](./${json_name}) |"
  done
  echo ""
  echo "## Como Re-rodar"
  echo ""
  echo '```bash'
  echo "cd output/workspace/lead-hunting-engine"
  echo "bash scripts/audit-a11y.sh --token <uuid-de-convite-valido>"
  echo '```'
  echo ""
  echo "## Notas"
  echo ""
  echo "- Para auditar \`/invite/{token}\` corretamente, precisa de token valido (criar via SQL no Supabase, ver smoke-auth.sh)."
  echo "- axe-core valida apenas o **DOM renderizado** — testes de teclado e leitor de tela manuais sao complementares."
  echo "- Para auditoria completa, considere \`@axe-core/playwright\` em uma suite Playwright dedicada (futuro)."
} > "$REPORT"

echo ""
echo "━━━ Resumo ━━━"
echo "Paginas: ${TOTAL_PAGES} | Total: ${TOTAL_VIOLATIONS} | Serious: ${TOTAL_SERIOUS} | Critical: ${TOTAL_CRITICAL}"
echo "Relatorio: ${REPORT}"

if [[ $TOTAL_CRITICAL -eq 0 && $TOTAL_SERIOUS -eq 0 ]]; then
  exit 0
else
  exit 1
fi
