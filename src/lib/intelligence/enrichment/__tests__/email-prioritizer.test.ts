import {
  classifyEmailDomain,
  GENERIC_EMAIL_PREFIXES,
  isGenericEmail,
  prioritizeEmails,
  prioritizeEmailsByDomain,
} from '../enrichers/email-prioritizer'

describe('email-prioritizer — TASK-1 intake-review (CL-141)', () => {
  describe('GENERIC_EMAIL_PREFIXES', () => {
    it('inclui os prefixos LGPD minimos esperados', () => {
      const required = ['contato', 'vendas', 'sac', 'comercial', 'atendimento', 'info']
      for (const prefix of required) {
        expect(GENERIC_EMAIL_PREFIXES).toContain(prefix)
      }
    })
  })

  describe('isGenericEmail', () => {
    it('retorna true para emails institucionais', () => {
      expect(isGenericEmail('contato@acme.com')).toBe(true)
      expect(isGenericEmail('vendas@acme.com.br')).toBe(true)
      expect(isGenericEmail('sac@acme.com')).toBe(true)
      expect(isGenericEmail('comercial@acme.com')).toBe(true)
    })

    it('retorna true mesmo quando prefixo tem tokens extras apos . ou -', () => {
      expect(isGenericEmail('contato.comercial@acme.com')).toBe(true)
      expect(isGenericEmail('vendas-sp@acme.com')).toBe(true)
      expect(isGenericEmail('sac_novo@acme.com')).toBe(true)
      expect(isGenericEmail('info+newsletter@acme.com')).toBe(true)
    })

    it('retorna false para emails pessoais', () => {
      expect(isGenericEmail('joao@acme.com')).toBe(false)
      expect(isGenericEmail('joao.silva@acme.com')).toBe(false)
      expect(isGenericEmail('maria.santos@acme.com.br')).toBe(false)
    })

    it('eh case-insensitive', () => {
      expect(isGenericEmail('CONTATO@ACME.COM')).toBe(true)
      expect(isGenericEmail('  Vendas@Acme.com  ')).toBe(true)
    })

    it('retorna false para entrada invalida ou vazia', () => {
      expect(isGenericEmail(null)).toBe(false)
      expect(isGenericEmail(undefined)).toBe(false)
      expect(isGenericEmail('')).toBe(false)
      expect(isGenericEmail('nao-eh-email')).toBe(false)
      expect(isGenericEmail('sem-arroba.com')).toBe(false)
      expect(isGenericEmail('@acme.com')).toBe(false)
      expect(isGenericEmail('contato@')).toBe(false)
    })
  })

  describe('prioritizeEmails — casos-borda', () => {
    it('so-pessoais: usa o primeiro pessoal como primary', () => {
      const res = prioritizeEmails(['joao.silva@acme.com', 'maria@acme.com'])
      expect(res.primary).toBe('joao.silva@acme.com')
      expect(res.secondary).toEqual(['maria@acme.com'])
    })

    it('so-genericos: usa o primeiro generico como primary', () => {
      const res = prioritizeEmails(['contato@acme.com', 'vendas@acme.com'])
      expect(res.primary).toBe('contato@acme.com')
      expect(res.secondary).toEqual(['vendas@acme.com'])
    })

    it('mix: prefere generico mesmo quando pessoal vem antes na entrada', () => {
      const res = prioritizeEmails([
        'joao@acme.com',
        'contato@acme.com',
        'sac@acme.com',
      ])
      expect(res.primary).toBe('contato@acme.com')
      expect(res.secondary).toEqual(['sac@acme.com', 'joao@acme.com'])
    })

    it('cenario do criterio de aceite: contato@ escolhido em mix', () => {
      const res = prioritizeEmails([
        'joao@acme.com',
        'contato@acme.com',
        'sac@acme.com',
      ])
      expect(res.primary).toBe('contato@acme.com')
    })

    it('vazio: retorna primary null e secondary vazio', () => {
      expect(prioritizeEmails([])).toEqual({ primary: null, secondary: [] })
      expect(prioritizeEmails(null)).toEqual({ primary: null, secondary: [] })
      expect(prioritizeEmails(undefined)).toEqual({ primary: null, secondary: [] })
    })

    it('deduplica e normaliza (trim + lowercase)', () => {
      const res = prioritizeEmails([
        'Contato@Acme.com',
        '  contato@acme.com  ',
        'joao@acme.com',
      ])
      expect(res.primary).toBe('contato@acme.com')
      expect(res.secondary).toEqual(['joao@acme.com'])
    })

    it('descarta entradas invalidas sem lancar', () => {
      const res = prioritizeEmails(['nao-eh-email', 'contato@acme.com', '', 'joao@acme.com'])
      expect(res.primary).toBe('contato@acme.com')
      expect(res.secondary).toEqual(['joao@acme.com'])
    })

    it('dominios diferentes: preferencia ainda favorece genericos', () => {
      const res = prioritizeEmails([
        'joao@acme.com',
        'maria@outra.com',
        'vendas@terceiro.com',
      ])
      expect(res.primary).toBe('vendas@terceiro.com')
      expect(res.secondary).toEqual(['joao@acme.com', 'maria@outra.com'])
    })

    it('so emails invalidos: primary null', () => {
      const res = prioritizeEmails(['foo', 'bar@', '@baz'])
      expect(res.primary).toBeNull()
      expect(res.secondary).toEqual([])
    })
  })

  describe('prioritizeEmailsByDomain', () => {
    it('agrupa por dominio e aplica prioritizacao por grupo', () => {
      const res = prioritizeEmailsByDomain([
        'joao@acme.com',
        'contato@acme.com',
        'maria@outra.com',
        'sac@outra.com',
      ])
      expect(res.get('acme.com')).toEqual({
        primary: 'contato@acme.com',
        secondary: ['joao@acme.com'],
      })
      expect(res.get('outra.com')).toEqual({
        primary: 'sac@outra.com',
        secondary: ['maria@outra.com'],
      })
    })

    it('retorna Map vazio para entrada vazia ou nula', () => {
      expect(prioritizeEmailsByDomain([]).size).toBe(0)
      expect(prioritizeEmailsByDomain(null).size).toBe(0)
    })
  })

  describe('classifyEmailDomain — dominio canonico vs externo (blacksmith 06-11)', () => {
    it('mesmo dominio registravel do site e canonical (com www e path)', () => {
      expect(classifyEmailDomain('joao@empresa.com.br', 'https://www.empresa.com.br')).toBe('canonical')
      expect(classifyEmailDomain('contato@empresa.com.br', 'https://www.empresa.com.br/contato?x=1')).toBe(
        'canonical',
      )
    })

    it('subdominio do site canonico conta como canonical (.com.br suportado)', () => {
      expect(classifyEmailDomain('contato@loja.empresa.com.br', 'https://www.empresa.com.br')).toBe(
        'canonical',
      )
    })

    it('dominio .com simples tambem matcheia', () => {
      expect(classifyEmailDomain('vendas@acme.com', 'https://acme.com')).toBe('canonical')
      expect(classifyEmailDomain('vendas@app.acme.com', 'https://www.acme.com')).toBe('canonical')
    })

    it('gmail.com e plataforma.com sao external', () => {
      expect(classifyEmailDomain('joao@gmail.com', 'https://empresa.com.br')).toBe('external')
      expect(classifyEmailDomain('contato@plataforma.com', 'https://empresa.com.br')).toBe('external')
    })

    it('empresa.com nao matcheia empresa.com.br (registraveis distintos)', () => {
      expect(classifyEmailDomain('joao@empresa.com', 'https://empresa.com.br')).toBe('external')
      expect(classifyEmailDomain('joao@outra.com.br', 'https://empresa.com.br')).toBe('external')
    })

    it('e tolerante a website sem protocolo', () => {
      expect(classifyEmailDomain('joao@empresa.com.br', 'www.empresa.com.br')).toBe('canonical')
      expect(classifyEmailDomain('joao@empresa.com.br', 'empresa.com.br')).toBe('canonical')
    })

    it('e case-insensitive no email', () => {
      expect(classifyEmailDomain('JOAO@EMPRESA.COM.BR', 'https://empresa.com.br')).toBe('canonical')
    })

    it('websiteUrl ausente/invalido retorna unknown', () => {
      expect(classifyEmailDomain('joao@empresa.com.br', null)).toBe('unknown')
      expect(classifyEmailDomain('joao@empresa.com.br', undefined)).toBe('unknown')
      expect(classifyEmailDomain('joao@empresa.com.br', '')).toBe('unknown')
      expect(classifyEmailDomain('joao@empresa.com.br', '   ')).toBe('unknown')
      expect(classifyEmailDomain('joao@empresa.com.br', 'isso nao e uma url')).toBe('unknown')
    })

    it('email invalido retorna unknown mesmo com site valido', () => {
      expect(classifyEmailDomain('nao-eh-email', 'https://empresa.com.br')).toBe('unknown')
      expect(classifyEmailDomain('', 'https://empresa.com.br')).toBe('unknown')
    })
  })

  describe('descarta nomes de arquivo que o regex confunde com e-mail', () => {
    it('rejeita sprites/assets (ajax-loader@2x.gif, icon@3x.png, app@2x.css)', () => {
      const res = prioritizeEmails(['ajax-loader@2x.gif', 'icon@3x.png', 'app@2x.css', 'logo@1x.svg'])
      expect(res.primary).toBeNull()
      expect(res.secondary).toEqual([])
    })

    it('mantem e-mail real e descarta o asset no mesmo lote', () => {
      const res = prioritizeEmails(['ajax-loader@2x.gif', 'adm@medcenter.com.br'])
      expect(res.primary).toBe('adm@medcenter.com.br')
      expect(res.secondary).toEqual([])
    })
  })
})
