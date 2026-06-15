/**
 * GET /api/v1/admin/outreach/contact-queue?niche=&limit=
 *
 * Fila de CONTATO DIRETO (WhatsApp/telefone) — o canal certo para o ICP (negócio
 * sem site, que tem telefone mas raramente e-mail). Retorna leads com telefone,
 * ainda não contatados por canal direto e não suprimidos, classificados em
 * móvel/fixo, com uma mensagem curta de WhatsApp gerada de forma determinística
 * (sem LLM — rápido e barato no worklist) e os links `wa.me`/`tel:` prontos.
 *
 * Gate por canal: aqui o "hard" é TER TELEFONE — NÃO exige e-mail nem
 * integrityScore≥60 (esses são do gate de e-mail). Só móvel recebe link WhatsApp.
 */
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { classifyPhone, buildWaMeLink, buildTelLink, formatPhoneDisplay } from '@/lib/outreach/phone-utils'
import { getSenderProfile } from '@/lib/outreach/sender-profile'
import { renderTemplateVars, buildLeadVars, buildSenderVars } from '@/lib/pitch/template-vars'

/** Fallback quando o operador ainda não tem template de WhatsApp cadastrado. */
const FALLBACK_WA_TEMPLATE =
  'Oi, tudo bem? Falo com quem cuida da presença online da {{empresa}}?\n\n' +
  'Encontrei vocês no Google procurando por {{segmento}} em {{cidade}} e notei que {{problema}}. ' +
  'Monto site simples com WhatsApp e agendamento. Posso te mandar uma ideia de como ficaria?\n\n' +
  'Se não fizer sentido, me avisa que não insisto.'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const url = new URL(request.url)
    const niche = url.searchParams.get('niche') || undefined
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)
    const now = new Date()

    // Leads já contatados por canal direto (excluir — evita re-contato no MVP).
    const contacted = await prisma.contactEvent.findMany({
      where: { userId: admin.id, channel: { in: ['WHATSAPP', 'TELEFONE'] } },
      select: { leadId: true },
      distinct: ['leadId'],
    })
    const contactedSet = new Set(contacted.map((c) => c.leadId))

    // Supressões de telefone ativas (E.164).
    const supp = await prisma.suppressionEntry.findMany({
      where: { kind: 'PHONE' },
      select: { value: true, cooldownUntil: true },
    })
    const suppSet = new Set(
      supp.filter((s) => s.cooldownUntil === null || s.cooldownUntil > now).map((s) => s.value),
    )

    // Template de WhatsApp do operador (favorito primeiro) + perfil do remetente.
    // A mensagem do worklist agora vem do template real (editável em /templates),
    // não mais de um texto fixo no código.
    const [waTemplate, sender] = await Promise.all([
      prisma.pitchTemplate.findFirst({
        where: { userId: admin.id, channel: 'whatsapp' },
        orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
        select: { content: true },
      }),
      getSenderProfile(),
    ])
    const templateBody = waTemplate?.content ?? FALLBACK_WA_TEMPLATE
    const senderVars = buildSenderVars(sender)

    const leads = await prisma.lead.findMany({
      where: { userId: admin.id, status: 'NEW', phone: { not: null }, ...(niche ? { niche } : {}) },
      orderBy: { score: 'desc' },
      take: 500,
      select: { id: true, businessName: true, phone: true, niche: true, signals: true, city: true, opportunities: true, website: true },
    })

    const items: Array<Record<string, unknown>> = []
    let mobile = 0
    let landline = 0
    let suppressed = 0
    let alreadyContacted = 0
    let noValidPhone = 0

    for (const l of leads) {
      if (contactedSet.has(l.id)) { alreadyContacted += 1; continue }
      const { e164, isMobile } = classifyPhone(l.phone)
      if (!e164) { noValidPhone += 1; continue }
      if (suppSet.has(e164)) { suppressed += 1; continue }
      if (items.length >= limit) continue // continua contando p/ summary honesto

      if (isMobile) mobile += 1
      else landline += 1
      const leadVars = buildLeadVars({ businessName: l.businessName, city: l.city, niche: l.niche, signals: l.signals, opportunities: l.opportunities, website: l.website })
      const message = renderTemplateVars(templateBody, { ...leadVars, ...senderVars })
      items.push({
        leadId: l.id,
        businessName: l.businessName,
        niche: l.niche,
        city: l.city,
        phoneDisplay: formatPhoneDisplay(l.phone),
        e164,
        isMobile,
        problems: [leadVars.problema],
        message,
        waLink: buildWaMeLink(l.phone, message),
        telLink: buildTelLink(l.phone),
      })
    }

    return successResponse({
      items,
      summary: { shown: items.length, mobile, landline, suppressed, alreadyContacted, noValidPhone, candidates: leads.length },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
