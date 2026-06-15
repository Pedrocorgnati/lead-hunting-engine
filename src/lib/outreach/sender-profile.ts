import 'server-only'

/**
 * Perfil do remetente — alimenta os placeholders {{meu_nome}}, {{minha_empresa}},
 * {{meu_whatsapp}}, {{meu_portfolio}} dos pitch templates. Configurado 1x pelo
 * operador (SystemConfig). Sem perfil válido o WhatsApp/portfólio saem vazios —
 * por isso a UI dos templates avisa quando falta configurar.
 */
import { getConfig, setConfig } from '@/lib/services/system-config'
import type { SenderProfile } from '@/lib/pitch/template-vars'

const DEFAULT_PROFILE: SenderProfile = {
  name: 'Pedro Corgnati',
  company: '',
  whatsapp: '',
  portfolio: 'https://corgnati.com',
}

export async function getSenderProfile(): Promise<SenderProfile> {
  const cfg = await getConfig<Partial<SenderProfile>>('outreach.sender_profile')
  return {
    name: cfg.name ?? DEFAULT_PROFILE.name,
    company: cfg.company ?? DEFAULT_PROFILE.company,
    whatsapp: cfg.whatsapp ?? DEFAULT_PROFILE.whatsapp,
    portfolio: cfg.portfolio ?? DEFAULT_PROFILE.portfolio,
  }
}

export async function setSenderProfile(profile: SenderProfile, by?: string): Promise<void> {
  await setConfig(
    'outreach.sender_profile',
    {
      name: profile.name.slice(0, 120),
      company: profile.company.slice(0, 160),
      whatsapp: profile.whatsapp.slice(0, 40),
      portfolio: profile.portfolio.slice(0, 300),
    },
    by,
  )
}

/** True se o perfil ainda não tem o mínimo para os templates (WhatsApp). */
export function senderProfileIncomplete(profile: SenderProfile): boolean {
  return !profile.whatsapp.trim() || !profile.name.trim()
}
