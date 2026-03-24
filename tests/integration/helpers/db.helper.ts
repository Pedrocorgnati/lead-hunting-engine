/**
 * Helpers de banco de dados para limpeza e setup em testes de integração.
 *
 * Usado no afterEach para remover dados criados durante os testes,
 * evitando que um teste polua o estado para o próximo.
 */
import { prisma } from '@/lib/prisma'

// IDs de registros criados durante um teste — registrar aqui para limpeza
const createdIds: {
  jobIds: string[]
  leadIds: string[]
  inviteIds: string[]
  credentialProviders: string[]
} = {
  jobIds: [],
  leadIds: [],
  inviteIds: [],
  credentialProviders: [],
}

export function trackCreatedJob(id: string): void {
  createdIds.jobIds.push(id)
}

export function trackCreatedLead(id: string): void {
  createdIds.leadIds.push(id)
}

export function trackCreatedInvite(id: string): void {
  createdIds.inviteIds.push(id)
}

export function trackCreatedCredential(provider: string): void {
  createdIds.credentialProviders.push(provider)
}

/**
 * Limpa todos os registros rastreados. Chamar no afterEach.
 */
export async function cleanupTracked(): Promise<void> {
  if (createdIds.credentialProviders.length > 0) {
    await prisma.apiCredential.deleteMany({
      where: { provider: { in: createdIds.credentialProviders } },
    })
    createdIds.credentialProviders = []
  }

  if (createdIds.inviteIds.length > 0) {
    await prisma.invite.deleteMany({
      where: { id: { in: createdIds.inviteIds } },
    })
    createdIds.inviteIds = []
  }

  // Leads devem ser deletados antes dos jobs (FK)
  if (createdIds.leadIds.length > 0) {
    await prisma.lead.deleteMany({
      where: { id: { in: createdIds.leadIds } },
    })
    createdIds.leadIds = []
  }

  if (createdIds.jobIds.length > 0) {
    await prisma.collectionJob.deleteMany({
      where: { id: { in: createdIds.jobIds } },
    })
    createdIds.jobIds = []
  }
}

/**
 * Obtém o perfil de um usuário diretamente do banco.
 * Útil para verificar side effects de operações.
 */
export async function getProfileFromDb(userId: string) {
  return prisma.userProfile.findUnique({ where: { id: userId } })
}

/**
 * Obtém um job diretamente do banco.
 */
export async function getJobFromDb(jobId: string) {
  return prisma.collectionJob.findUnique({ where: { id: jobId } })
}

/**
 * Obtém um lead diretamente do banco.
 */
export async function getLeadFromDb(leadId: string) {
  return prisma.lead.findUnique({ where: { id: leadId } })
}

/**
 * Obtém um convite diretamente do banco.
 */
export async function getInviteFromDb(inviteId: string) {
  return prisma.invite.findUnique({ where: { id: inviteId } })
}

/**
 * Reseta o campo deletionRequestedAt de um usuário (para testes de LGPD).
 */
export async function resetDeletionRequest(userId: string): Promise<void> {
  await prisma.userProfile.update({
    where: { id: userId },
    data: { deletionRequestedAt: null },
  })
}
