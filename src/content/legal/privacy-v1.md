---
version: "1.0"
updatedAt: "2026-04-21"
status: "draft-pending-legal-review"
---

# Política de Privacidade — Lead Hunting Engine

**Versão 1.0 — atualizado em 21/04/2026**

> **Aviso:** esta política foi redigida com base nos requisitos LGPD descritos no INTAKE do produto. O texto final requer revisão por assessoria jurídica especializada antes do deploy em produção. Até lá, vigora como "v1.0 pendente de revisão jurídica".

---

## 1. Base legal

A Plataforma **Lead Hunting Engine** realiza tratamento de dados públicos com fundamento no **Art. 7, inciso IX da LGPD** (legítimo interesse do controlador), aplicado exclusivamente no contexto de prospecção comercial **B2B** entre pessoas jurídicas e profissionais publicamente expostos em canais oficiais.

Também se aplica, quando pertinente, o **Art. 9 da LGPD** (transparência), que garante ao titular o acesso facilitado às informações sobre o tratamento de seus dados.

Não coletamos dados enquadrados no **Art. 11 da LGPD** (dados sensíveis: origem racial, convicção religiosa, opinião política, filiação sindical, saúde, vida sexual, biometria, etc.).

## 2. LIA — Avaliação de Legítimo Interesse (resumo)

Nossa LIA formal, revisada periodicamente, demonstra:

- **Propósito legítimo:** prospecção comercial B2B de pessoas jurídicas publicamente expostas em canais de divulgação comercial (sites institucionais, redes sociais empresariais, diretórios públicos).
- **Necessidade:** os dados coletados são estritamente necessários para identificar o potencial comercial do negócio (nome da empresa, site, telefone comercial, endereço público, presença digital). Não há meios menos invasivos que atinjam o mesmo propósito em escala equivalente.
- **Balanceamento:** os direitos e expectativas razoáveis do titular são resguardados por: (a) coleta apenas de dados profissionais publicamente divulgados; (b) minimização e descarte de e-mails pessoais quando identificamos endereços institucionais; (c) canais públicos e fáceis de oposição/remoção; (d) retenção limitada no tempo; (e) segurança técnica adequada.

A versão completa da LIA está disponível mediante solicitação formal ao Encarregado (DPO).

## 3. Dados tratados

- **Dados de pessoas jurídicas:** razão social, nome fantasia, ramo de atividade, endereço comercial, telefone comercial, site, links públicos de redes sociais, avaliações públicas, CNPJ quando público.
- **Sinais derivados e analíticos:** score de oportunidade comercial, sinais de maturidade digital, indicadores de gap digital, histórico de interações do Usuário contratante com o lead.
- **Dados de contato profissional:** e-mails institucionais (`contato@`, `vendas@`, `comercial@`, `sac@`, `atendimento@` e equivalentes). Quando somente e-mail pessoal profissional aparece (ex.: `nome.sobrenome@empresa.com`), aplicamos heurística de priorização (ver item 7) e descartamos o e-mail pessoal assim que um institucional é identificado.
- **Dados do Usuário contratante:** nome, e-mail corporativo, função, organização, histórico de acesso à Plataforma, configurações.

**Não coletamos:** CPF, RG, dados bancários, e-mail pessoal não profissional, dados sensíveis (Art. 11 LGPD), dados de menores de idade.

## 4. Finalidade

Os dados são tratados exclusivamente para:

- Identificação e qualificação de oportunidades comerciais B2B para o Usuário contratante.
- Geração de insights, scoring e priorização de leads.
- Fornecimento de histórico, métricas e relatórios internos ao Usuário contratante.
- Comunicação operacional com o Usuário contratante sobre funcionamento da Plataforma.

Não utilizamos os dados para perfis discriminatórios, decisões automatizadas com efeitos jurídicos diretos sobre titulares, nem para comercialização a terceiros.

## 5. Compartilhamento

Compartilhamos dados apenas quando estritamente necessário:

- **Operadores/Subprocessadores:** provedores de nuvem, banco de dados, e-mail transacional, observabilidade — todos sob contrato com cláusulas LGPD adequadas.
- **Autoridades competentes:** em cumprimento de determinação judicial, requisição da ANPD ou obrigação legal vinculante.
- **Usuário contratante da conta:** dados de leads pesquisados são acessíveis dentro da conta do Usuário contratante, conforme o nível de autorização configurado.

Não há venda, aluguel ou cessão comercial de dados a terceiros.

## 6. Retenção

Dados de leads identificados são retidos por **6 a 12 meses** a partir da última atividade relevante, com **política de decay** progressivo:

- Após 6 meses sem uso ou nova atualização, o lead entra em estado de "decay parcial" — campos derivados (scoring, sinais) são recalculados e a confiabilidade sinalizada é reduzida.
- Após 12 meses sem uso, o lead é automaticamente marcado para exclusão, salvo se o Usuário contratante sinalizar interesse comercial ativo.
- Pedidos de oposição, eliminação ou retificação são atendidos em até 15 dias, observadas as hipóteses legais de retenção (cumprimento de obrigação legal, exercício regular de direitos em processos).

Dados de Usuários contratantes são mantidos enquanto durar o contrato e, após o encerramento, conforme obrigações fiscais, contábeis e legais aplicáveis.

## 7. Heurística de minimização de e-mails

Quando múltiplos e-mails são encontrados para um mesmo domínio empresarial, priorizamos endereços genéricos/institucionais (ex.: `contato@`, `vendas@`, `sac@`, `comercial@`, `atendimento@`) em vez de e-mails pessoais identificáveis. Endereços pessoais só são retidos quando nenhum institucional está disponível e são descartados assim que um genérico é identificado.

Referência técnica interna: `CL-141` — `email-prioritizer`.

## 8. Segurança

Aplicamos medidas técnicas e organizacionais razoáveis para proteger os dados:

- Criptografia em trânsito (TLS) e em repouso para credenciais e segredos.
- Controle de acesso por papéis (RBAC) com princípio do menor privilégio.
- Auditoria de eventos sensíveis (acesso a dados, exportação, reset de configurações).
- Hardening de infraestrutura, rate limiting e monitoramento de incidentes.
- Política formal de resposta a incidentes, com notificação à ANPD e titulares quando aplicável, nos prazos legais.

Nenhum sistema é 100% imune — o Usuário deve proteger suas credenciais e notificar imediatamente qualquer suspeita de comprometimento.

## 9. Direitos do titular

Em conformidade com o Art. 18 da LGPD, o titular tem direito a:

- **Confirmação** da existência de tratamento.
- **Acesso** aos dados.
- **Correção** de dados incompletos, inexatos ou desatualizados.
- **Anonimização, bloqueio ou eliminação** de dados desnecessários, excessivos ou tratados em desconformidade.
- **Portabilidade** para outro fornecedor, observados regulamentos aplicáveis.
- **Eliminação** dos dados tratados com base no consentimento.
- **Informação** sobre entidades com as quais o controlador compartilha dados.
- **Revogação de consentimento**, quando aplicável.
- **Oposição** a tratamento em caso de descumprimento da lei.

Para exercer qualquer desses direitos, utilize o canal público de remoção ou contate o Encarregado (DPO) pelos canais listados no item 12.

## 10. Cookies e tecnologias similares

A Plataforma utiliza cookies e mecanismos equivalentes estritamente necessários ao funcionamento (sessão, autenticação, preferências de interface) e cookies analíticos agregados. Não utilizamos cookies de publicidade comportamental de terceiros.

O Usuário pode, a qualquer tempo, ajustar configurações do navegador para gerenciar cookies. A ausência de alguns cookies essenciais pode limitar funcionalidades da Plataforma.

## 11. Alterações

Esta Política pode ser revisada. Alterações relevantes serão comunicadas por e-mail e/ou notificação na Plataforma. A versão vigente e sua data de atualização ficam sempre visíveis no rodapé da Plataforma e nesta página. O histórico de versões fica disponível mediante solicitação ao Encarregado.

## 12. Contato do Encarregado (DPO) {#contato-dpo}

**Encarregado pelo Tratamento de Dados Pessoais (DPO)**
E-mail: **dpo@leadhuntingengine.com.br**
Canal público de remoção de dados: [/profile/deletion-request](/profile/deletion-request)

Resposta inicial em até 15 dias corridos. Decisões de negativa ou complemento são fundamentadas por escrito conforme Art. 18, §§3º e 4º da LGPD.

---

**Versão 1.0 — 21/04/2026**
