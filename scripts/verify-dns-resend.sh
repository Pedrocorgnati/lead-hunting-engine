#!/usr/bin/env bash
# scripts/verify-dns-resend.sh — Valida configuracao DNS para Resend (SPF/DKIM/DMARC).
#
# Resolve pending action: M2-8 (G2-008) — Resend delivery em ambiente real.
#
# A presenca correta destes records reduz drasticamente a chance de o email de
# convite cair em spam ou ser rejeitado por providers (Gmail, Outlook, etc).
#
# Pre-requisitos:
#   - dig (pacote dnsutils ou bind-utils)
#   - Dominio em DNS publico (apos cliente apontar Resend)
#
# Uso:
#   bash scripts/verify-dns-resend.sh exemplo.com.br
#   bash scripts/verify-dns-resend.sh send.exemplo.com.br --resend-domain exemplo.com.br
#
# Saida: relatorio em $OUTDIR/RESEND-DNS-REPORT.md
# Exit code: 0 = todos os records esperados OK, 1 = algum faltando

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <dominio-de-envio> [--resend-domain <root-domain>]" >&2
  echo "Exemplo: $0 send.exemplo.com.br" >&2
  exit 2
fi

SEND_DOMAIN="$1"
shift
RESEND_DOMAIN="${SEND_DOMAIN}"
OUTDIR_DEFAULT="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)/output/wbs/lead-hunting-engine"
OUTDIR="${OUTDIR:-$OUTDIR_DEFAULT}"
REPORT="${OUTDIR}/RESEND-DNS-REPORT.md"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resend-domain) RESEND_DOMAIN="$2"; shift 2 ;;
    --out) OUTDIR="$2"; REPORT="${OUTDIR}/RESEND-DNS-REPORT.md"; shift 2 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUTDIR"

if ! command -v dig >/dev/null 2>&1; then
  echo "ERRO: \`dig\` nao instalado. Instale via: sudo apt install dnsutils" >&2
  exit 2
fi

echo "━━━ verify-dns-resend.sh — ${SEND_DOMAIN} ━━━"

# ─── Helpers ──────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; WARN=0; SKIPPED=0
RESULTS=()

check_record() {
  local label="$1" host="$2" type="$3" pattern="$4" severity="${5:-FAIL}"
  # severity: FAIL (default — ausencia/mismatch quebra), WARN (so em opcionais).
  local out
  out=$(dig +short "$type" "$host" 2>/dev/null | tr '\n' ' ')
  if [[ -z "$out" ]]; then
    RESULTS+=("$label|${severity}|${host} (${type})|<sem registro>|esperado: ${pattern}")
    case "$severity" in
      FAIL) FAIL=$((FAIL+1)); echo "  [FAIL] ${label}: ${host} ${type} sem resposta" ;;
      WARN) WARN=$((WARN+1)); echo "  [WARN] ${label}: ${host} ${type} sem resposta (opcional)" ;;
      SKIP) SKIPPED=$((SKIPPED+1)); echo "  [SKIP] ${label}: ${host} ${type} sem resposta" ;;
    esac
  elif echo "$out" | grep -qiE "$pattern"; then
    RESULTS+=("$label|PASS|${host} (${type})|$out|matched: ${pattern}")
    PASS=$((PASS+1))
    echo "  [PASS] ${label}: ${host} ${type} = ${out}"
  else
    # Mismatch e SEMPRE FAIL (ou WARN explicito) — nunca silencioso.
    RESULTS+=("$label|${severity}|${host} (${type})|$out|MISMATCH — esperado: ${pattern}")
    case "$severity" in
      FAIL) FAIL=$((FAIL+1)); echo "  [FAIL] ${label}: ${host} ${type} = ${out} NAO bate ${pattern}" ;;
      WARN) WARN=$((WARN+1)); echo "  [WARN] ${label}: ${host} ${type} = ${out} (mismatch tolerado)" ;;
    esac
  fi
}

# ─── 1. SPF (TXT root) — FAIL se ausente ou nao incluir _spf.resend.com ──────
echo ""
echo "▶ SPF — autoriza Resend a enviar como ${RESEND_DOMAIN}"
check_record "SPF" "${RESEND_DOMAIN}" "TXT" "include:_spf\.resend\.com" FAIL

# ─── 2. DKIM Resend (CNAME ou TXT em resend._domainkey) — FAIL se ausente ───
echo ""
echo "▶ DKIM — assinatura Resend"
# Tenta CNAME primeiro; se falhar, fallback para TXT.
out_cname=$(dig +short CNAME "resend._domainkey.${RESEND_DOMAIN}" 2>/dev/null | tr '\n' ' ')
out_txt=$(dig +short TXT "resend._domainkey.${RESEND_DOMAIN}" 2>/dev/null | tr '\n' ' ')
if [[ -n "$out_cname" ]] && echo "$out_cname" | grep -qiE "resend\.com|amazonses\.com"; then
  RESULTS+=("DKIM-resend|PASS|resend._domainkey.${RESEND_DOMAIN} (CNAME)|$out_cname|matched")
  PASS=$((PASS+1))
  echo "  [PASS] DKIM-resend (CNAME): $out_cname"
elif [[ -n "$out_txt" ]] && echo "$out_txt" | grep -qiE "v=DKIM1|p="; then
  RESULTS+=("DKIM-resend|PASS|resend._domainkey.${RESEND_DOMAIN} (TXT)|${out_txt:0:80}...|matched fallback TXT")
  PASS=$((PASS+1))
  echo "  [PASS] DKIM-resend (TXT fallback): ${out_txt:0:80}..."
else
  RESULTS+=("DKIM-resend|FAIL|resend._domainkey.${RESEND_DOMAIN}|<ausente ou invalido>|esperado CNAME para resend.com OU TXT v=DKIM1")
  FAIL=$((FAIL+1))
  echo "  [FAIL] DKIM-resend: ausente ou invalido"
fi

# ─── 3. DMARC (TXT em _dmarc) — FAIL se ausente ──────────────────────────────
echo ""
echo "▶ DMARC — politica de protecao"
check_record "DMARC" "_dmarc.${RESEND_DOMAIN}" "TXT" "v=DMARC1.*p=(none|quarantine|reject)" FAIL

# ─── 4. MX (opcional — apenas se receber bounces direto) ─────────────────────
echo ""
echo "▶ MX (opcional para Resend — Resend gerencia bounces internamente)"
check_record "MX-opcional" "${RESEND_DOMAIN}" "MX" ".+" SKIP

# ─── 5. Subdomain de envio (so se diferente do Resend domain) ───────────────
if [[ "$SEND_DOMAIN" != "$RESEND_DOMAIN" ]]; then
  echo ""
  echo "▶ Subdomain de envio: ${SEND_DOMAIN}"
  check_record "Subdomain-CNAME" "${SEND_DOMAIN}" "CNAME" ".+" WARN
fi

# ─── 6. Validacao SPF unicidade — RFC 7208: exatamente 1 record SPF ─────────
spf_records=$(dig +short TXT "${RESEND_DOMAIN}" 2>/dev/null | grep -ic "v=spf1")
if [[ "$spf_records" -gt 1 ]]; then
  FAIL=$((FAIL+1))
  RESULTS+=("SPF-uniqueness|FAIL|${RESEND_DOMAIN}|${spf_records} records SPF|RFC 7208: domain DEVE ter EXATAMENTE 1 SPF TXT — multi-SPF e tratado como permerror")
  echo "  [FAIL] ${spf_records} records SPF detectados — RFC 7208 violacao (consolide includes em UM unico record)"
fi

# ─── Relatorio ────────────────────────────────────────────────────────────────
{
  echo "# RESEND-DNS-REPORT — Milestone 2 (M2-8 / G2-008)"
  echo ""
  echo "**Data:** $(date -Iseconds)"
  echo "**Send domain:** \`${SEND_DOMAIN}\`"
  echo "**Resend domain:** \`${RESEND_DOMAIN}\`"
  echo ""
  echo "## Resumo"
  echo ""
  echo "| Status | Total |"
  echo "|--------|-------|"
  echo "| PASS | ${PASS} |"
  echo "| WARN | ${WARN} |"
  echo "| SKIP | ${SKIPPED} |"
  echo "| FAIL | ${FAIL} |"
  echo ""
  if [[ $FAIL -eq 0 ]]; then
    if [[ $WARN -eq 0 ]]; then
      echo "**Veredicto:** APROVADO — DNS pronto para envio via Resend"
    else
      echo "**Veredicto:** APROVADO COM RESSALVAS — corrigir warnings antes de producao"
    fi
  else
    echo "**Veredicto:** REPROVADO — emails podem cair em spam ou ser rejeitados"
  fi
  echo ""
  echo "## Detalhamento"
  echo ""
  echo "| Check | Status | Host (Type) | Valor encontrado | Esperado / Observacao |"
  echo "|-------|--------|-------------|------------------|----------------------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r label st host val exp <<< "$r"
    val_short="${val:0:80}"
    echo "| ${label} | ${st} | \`${host}\` | \`${val_short}\` | ${exp} |"
  done
  echo ""
  echo "## Como Configurar (caso FAIL)"
  echo ""
  echo "1. Acesse o dashboard Resend: https://resend.com/domains"
  echo "2. Adicione o dominio \`${RESEND_DOMAIN}\`"
  echo "3. Copie os records sugeridos pelo Resend e adicione no provedor de DNS:"
  echo ""
  echo "   - **SPF (TXT no root):** \`v=spf1 include:_spf.resend.com ~all\`"
  echo "   - **DKIM (CNAME em resend._domainkey):** apontar para o valor que o Resend exibe"
  echo "   - **DMARC (TXT em _dmarc):** \`v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${RESEND_DOMAIN}; pct=100\`"
  echo ""
  echo "4. Aguarde propagacao DNS (15min a 24h dependendo do provider)."
  echo "5. Re-rode este script: \`bash scripts/verify-dns-resend.sh ${RESEND_DOMAIN}\`"
  echo "6. Apos APROVADO, dispare 1 convite real e confirme que chega na inbox (nao em spam)."
} > "$REPORT"

echo ""
echo "━━━ Resumo ━━━"
echo "PASS=${PASS} WARN=${WARN} FAIL=${FAIL}"
echo "Relatorio: ${REPORT}"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
