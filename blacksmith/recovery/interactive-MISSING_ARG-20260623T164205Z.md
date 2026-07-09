RECOVERY REPORT - interactive / MISSING_ARG
O QUE FALHOU: /execute-task da TASK-AUDIT-1 (module-3-auth-login do lead-hunting-engine) abortou com MISSING_ARG (exit 3) porque o workspace output/workspace/lead-hunting-engine nao existe em disco - o repositorio git@github.com:Pedrocorgnati/lead-hunting-engine.git nao esta clonado localmente (confirmado: output/ contem apenas wbs/, e nenhum clone existe em /home/pedro/Repositorios/).
POR QUE NAO DA PARA CORRIGIR AGORA: Restaurar o workspace exige git clone via SSH (rede externa + credencial SSH do GitHub), operacao outward-facing que deve ser autorizada pelo operador; e a validacao real so seria possivel re-executando o /execute-task completo, fora do escopo deste recovery.
PROXIMO PASSO (humano):
1. Clonar o workspace: git clone git@github.com:Pedrocorgnati/lead-hunting-engine.git output/workspace/lead-hunting-engine
2. Re-executar: /execute-task output/wbs/lead-hunting-engine/modules/module-3-auth-login/TASK-AUDIT-1.md .claude/projects/lead-hunting-engine.json
