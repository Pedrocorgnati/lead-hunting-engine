import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'

/**
 * Janela maxima (ms) entre POST /api/v1/consent e POST /api/v1/{waitlist|contact}
 * para considerar que o consent registrado pertence ao mesmo titular. 30 minutos
 * cobre a UX real (dismiss banner -> preencher form) com folga sem virar bait
 * para colisoes em NAT compartilhado.
 */
const RECENT_CONSENT_WINDOW_MS = 30 * 60 * 1000

/**
 * Resolve o `LandingConsent.id` mais recente que combine com `ipHash` dentro da
 * janela `RECENT_CONSENT_WINDOW_MS`. Usado para popular `WaitlistEntry.consentId`
 * / `ContactMessage.consentId` (FK exigida por `GET /api/v1/profile/consents/receipt`).
 * Retorna `null` quando nao ha consent vinculavel — o caller decide o fallback
 * (manter `consentLgpd` flag, abortar, etc).
 */
export async function findRecentConsentIdByIp(
  ipHash: string,
  now: Date = new Date(),
): Promise<string | null> {
  const sinceDate = new Date(now.getTime() - RECENT_CONSENT_WINDOW_MS)
  const consent = await prisma.landingConsent.findFirst({
    where: { ipHash, acceptedAt: { gte: sinceDate } },
    orderBy: { acceptedAt: 'desc' },
    select: { id: true },
  })
  return consent?.id ?? null
}

/** Calculo canonico do ipHash que casa com `POST /api/v1/consent`. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

/**
 * Recibo de consentimento LGPD (A1 / TASK-2).
 *
 * Contrato canonico retornado tanto pelo endpoint publico
 * `GET /api/v1/consent/receipt` quanto pelo autenticado
 * `GET /api/v1/profile/consents/receipt`. O contrato base de
 * registro/leitura permanece em `POST /api/v1/consent` — este modulo
 * apenas projeta um `LandingConsent` ja persistido em formato de recibo,
 * sem recriar a escrita do consent.
 */
export interface ConsentReceipt {
  receiptId: string
  policyVersion: string
  acceptedAt: string
  categories: string[]
  /** SHA-256 deterministico do conteudo do recibo — prova de integridade. */
  hash: string
  /** URL para baixar o recibo como anexo JSON assinado pelo hash. */
  downloadUrl: string
  /** Token opaco (`{receiptId}.{hash}`, base64url) para validacao offline. */
  downloadToken: string
}

/** Subconjunto de LandingConsent necessario para projetar o recibo. */
export interface ConsentSource {
  id: string
  version: string
  categories: string[]
  acceptedAt: Date
}

/**
 * Hash deterministico do conteudo do recibo. Independe de ordenacao das
 * categorias (sort estavel) para que o mesmo consent gere sempre o mesmo
 * hash, viabilizando verificacao de integridade pelo titular.
 */
export function hashConsentReceipt(source: ConsentSource): string {
  const canonical = [
    source.id,
    source.version,
    source.acceptedAt.toISOString(),
    [...source.categories].sort().join(','),
  ].join('|')
  return createHash('sha256').update(canonical).digest('hex')
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

/**
 * Projeta um registro de consent persistido em um recibo LGPD completo.
 * `basePath` distingue a origem da chamada (publica vs autenticada) para
 * que a `downloadUrl` aponte para o endpoint correto.
 */
export function buildConsentReceipt(
  source: ConsentSource,
  basePath = '/api/v1/consent/receipt',
): ConsentReceipt {
  const hash = hashConsentReceipt(source)
  return {
    receiptId: source.id,
    policyVersion: source.version,
    acceptedAt: source.acceptedAt.toISOString(),
    categories: source.categories,
    hash,
    downloadUrl: `${basePath}?receiptId=${encodeURIComponent(source.id)}&format=download`,
    downloadToken: toBase64Url(`${source.id}.${hash}`),
  }
}

/** Nome de arquivo canonico para download do recibo como anexo. */
export function consentReceiptFilename(receiptId: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `lead-hunting-engine-consent-receipt-${receiptId}-${date}.json`
}
