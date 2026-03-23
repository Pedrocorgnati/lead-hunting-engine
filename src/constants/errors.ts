// Error Catalog — codigos padronizados do ERROR-CATALOG.md
// Cada erro mapeia para HTTP status, mensagem usuario e mensagem tecnica

export interface AppError {
  code: string
  httpStatus: number
  userMessage: string
  technicalMessage: string
}

// ─── Validation (VAL) ───────────────────────────────
export const VAL_001 = { code: 'VAL_001', httpStatus: 400, userMessage: 'O campo {field} é obrigatório.', technicalMessage: 'Required field missing: {field}' }
export const VAL_002 = { code: 'VAL_002', httpStatus: 400, userMessage: 'Formato inválido para o campo {field}.', technicalMessage: "Invalid format for field '{field}': expected {expectedFormat}" }
export const VAL_003 = { code: 'VAL_003', httpStatus: 400, userMessage: 'O valor informado para {field} está fora do intervalo permitido ({min}-{max}).', technicalMessage: "Field '{field}' value out of range: min={min}, max={max}, received={received}" }
export const VAL_004 = { code: 'VAL_004', httpStatus: 400, userMessage: 'O conteúdo de {field} excede o limite de {max} caracteres.', technicalMessage: "Field '{field}' length {received} exceeds maximum of {max}" }

// ─── System (SYS) ───────────────────────────────────
export const SYS_001 = { code: 'SYS_001', httpStatus: 500, userMessage: 'Ocorreu um erro inesperado. Por favor, tente novamente.', technicalMessage: 'Unhandled internal server error: {errorId}' }
export const SYS_002 = { code: 'SYS_002', httpStatus: 503, userMessage: 'O serviço está temporariamente indisponível.', technicalMessage: 'External service unavailable: {service} — {reason}' }
export const SYS_003 = { code: 'SYS_003', httpStatus: 504, userMessage: 'A operação demorou mais do que o esperado.', technicalMessage: 'Operation timed out after {timeout}ms: {operation}' }
export const SYS_004 = { code: 'SYS_004', httpStatus: 502, userMessage: 'Recebemos uma resposta inesperada de um serviço externo.', technicalMessage: 'Invalid response from external service: {service}' }

// ─── Auth (AUTH) ─────────────────────────────────────
export const AUTH_001 = { code: 'AUTH_001', httpStatus: 401, userMessage: 'Sessão expirada. Faça login novamente.', technicalMessage: 'JWT token invalid or expired: {reason}' }
export const AUTH_002 = { code: 'AUTH_002', httpStatus: 401, userMessage: 'Email ou senha incorretos.', technicalMessage: 'Authentication failed: invalid credentials for email {emailHash}' }
export const AUTH_003 = { code: 'AUTH_003', httpStatus: 429, userMessage: 'Muitas tentativas. Tente novamente em {seconds} segundos.', technicalMessage: 'Login rate limited by Supabase Auth' }
export const AUTH_004 = { code: 'AUTH_004', httpStatus: 403, userMessage: 'Você não tem permissão para realizar esta ação.', technicalMessage: "Insufficient permission: user role '{userRole}' cannot perform '{action}'" }
export const AUTH_005 = { code: 'AUTH_005', httpStatus: 410, userMessage: 'Este link de redefinição expirou. Solicite um novo.', technicalMessage: 'Password reset token expired or already used' }
export const AUTH_006 = { code: 'AUTH_006', httpStatus: 401, userMessage: 'Esta operação requer confirmação de identidade.', technicalMessage: 'Re-authentication required for sensitive operation: {operation}' }

// ─── Rate Limiting (RATE) ────────────────────────────
export const RATE_001 = { code: 'RATE_001', httpStatus: 429, userMessage: 'Você fez muitas requisições em pouco tempo.', technicalMessage: 'Rate limit exceeded for endpoint: {endpoint}' }

// ─── User Profile (USER) ────────────────────────────
export const USER_050 = { code: 'USER_050', httpStatus: 409, userMessage: 'Sua solicitação de exclusão já foi registrada.', technicalMessage: 'Duplicate deletion request for user: {userId}' }
export const USER_080 = { code: 'USER_080', httpStatus: 404, userMessage: 'Perfil de usuário não encontrado.', technicalMessage: 'User profile not found: {userId}' }

// ─── Invites (INVITE) ───────────────────────────────
export const INVITE_001 = { code: 'INVITE_001', httpStatus: 403, userMessage: 'Apenas administradores podem gerar convites.', technicalMessage: 'Non-admin user attempted invite creation' }
export const INVITE_020 = { code: 'INVITE_020', httpStatus: 400, userMessage: 'Este email já possui uma conta ativa.', technicalMessage: 'Email already registered: {email}' }
export const INVITE_021 = { code: 'INVITE_021', httpStatus: 409, userMessage: 'Já existe um convite pendente para este email.', technicalMessage: 'Pending invite already exists for: {email}' }
export const INVITE_022 = { code: 'INVITE_022', httpStatus: 400, userMessage: 'Você deve aceitar os Termos de Uso e a Política de Privacidade.', technicalMessage: 'Terms acceptance required but not provided' }
export const INVITE_050 = { code: 'INVITE_050', httpStatus: 410, userMessage: 'Este convite expirou.', technicalMessage: 'Invite token expired: {token}' }
export const INVITE_051 = { code: 'INVITE_051', httpStatus: 410, userMessage: 'Este convite já foi utilizado.', technicalMessage: 'Invite token already used: {token}' }
export const INVITE_080 = { code: 'INVITE_080', httpStatus: 404, userMessage: 'Convite não encontrado ou inválido.', technicalMessage: 'Invite not found for token: {token}' }

// ─── Jobs (JOB) ──────────────────────────────────────
export const JOB_020 = { code: 'JOB_020', httpStatus: 400, userMessage: 'Os parâmetros da coleta são inválidos.', technicalMessage: 'Invalid job parameters: {details}' }
export const JOB_050 = { code: 'JOB_050', httpStatus: 429, userMessage: 'Você atingiu o limite de coletas simultâneas.', technicalMessage: 'Concurrent job limit reached for user: {userId}' }
export const JOB_051 = { code: 'JOB_051', httpStatus: 403, userMessage: 'Você não tem acesso a esta coleta.', technicalMessage: 'Job ownership mismatch: user {userId} != owner {ownerId}' }
export const JOB_080 = { code: 'JOB_080', httpStatus: 404, userMessage: 'Coleta não encontrada.', technicalMessage: 'Collection job not found: {jobId}' }

// ─── Leads (LEAD) ────────────────────────────────────
export const LEAD_020 = { code: 'LEAD_020', httpStatus: 400, userMessage: 'As anotações excedem o limite de 2000 caracteres.', technicalMessage: 'Notes length exceeds maximum: {length}' }
export const LEAD_050 = { code: 'LEAD_050', httpStatus: 403, userMessage: 'Você não tem acesso a este lead.', technicalMessage: 'Lead ownership mismatch: user {userId} != owner {ownerId}' }
export const LEAD_051 = { code: 'LEAD_051', httpStatus: 422, userMessage: 'Esta transição de status não é permitida para este lead.', technicalMessage: 'Invalid status transition: {from} -> {to}' }
export const LEAD_080 = { code: 'LEAD_080', httpStatus: 404, userMessage: 'Lead não encontrado.', technicalMessage: 'Lead not found: {leadId}' }

// ─── Export (EXPORT) ─────────────────────────────────
export const EXPORT_050 = { code: 'EXPORT_050', httpStatus: 400, userMessage: 'A exportação não pode conter mais de 1.000 registros por vez.', technicalMessage: 'Export record limit exceeded: {count}' }

// ─── Config (CONFIG) ─────────────────────────────────
export const CONFIG_050 = { code: 'CONFIG_050', httpStatus: 500, userMessage: 'Não foi possível processar a credencial.', technicalMessage: 'Credential encryption/decryption failed: {reason}' }
export const CONFIG_080 = { code: 'CONFIG_080', httpStatus: 404, userMessage: 'Credencial de API não encontrada para o provedor informado.', technicalMessage: 'API credential not found for provider: {provider}' }
export const CONFIG_081 = { code: 'CONFIG_081', httpStatus: 404, userMessage: 'Regra de pontuação não encontrada.', technicalMessage: 'Scoring rule not found: {ruleId}' }

// ─── Pitch (PITCH) ──────────────────────────────────
export const PITCH_050 = { code: 'PITCH_050', httpStatus: 503, userMessage: 'O serviço de geração de pitch está temporariamente indisponível.', technicalMessage: 'LLM service unavailable: {reason}' }
export const PITCH_051 = { code: 'PITCH_051', httpStatus: 422, userMessage: 'Não foi possível gerar um pitch confiável para este lead.', technicalMessage: 'Pitch generation failed validation: {reason}' }

// ─── Helper ─────────────────────────────────────────

export function errorResponse(error: AppError, details?: string) {
  return {
    error: {
      code: error.code,
      message: error.userMessage,
      ...(details && { details }),
    },
  }
}
