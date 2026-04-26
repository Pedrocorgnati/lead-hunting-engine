import {
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
})
