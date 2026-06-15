import {
  discoverEmails,
  extractEmailCandidatesFromHtml,
  extractEmailsFromRawJson,
} from '../enrichers/email-discovery'

describe('email-discovery — feature aumentar e-mails (blacksmith 06-11)', () => {
  describe('extractEmailsFromRawJson — retrocompatibilidade', () => {
    it('coleta chaves legadas no topo do objeto (email, contact_email, emails[])', () => {
      const res = extractEmailsFromRawJson({
        email: 'contato@acme.com',
        contact_email: 'vendas@acme.com',
        emails: ['sac@acme.com', 'financeiro@acme.com'],
      })
      expect(res).toEqual([
        'contato@acme.com',
        'vendas@acme.com',
        'sac@acme.com',
        'financeiro@acme.com',
      ])
    })

    it('retorna [] para entrada nula/indefinida', () => {
      expect(extractEmailsFromRawJson(null)).toEqual([])
      expect(extractEmailsFromRawJson(undefined)).toEqual([])
      expect(extractEmailsFromRawJson({})).toEqual([])
    })
  })

  describe('extractEmailsFromRawJson — traversal recursivo', () => {
    it('percorre objetos e arrays aninhados', () => {
      const res = extractEmailsFromRawJson({
        contacts: [{ email: 'contato@acme.com' }, { email: 'sac@acme.com' }],
        about: { company: { contact_email: 'vendas@acme.com' } },
      })
      expect(res).toEqual(['contato@acme.com', 'sac@acme.com', 'vendas@acme.com'])
    })

    it('extrai e-mail literal via regex de strings em chaves nao-email', () => {
      const res = extractEmailsFromRawJson({
        description: 'Fale com a gente em contato@acme.com ou pelo site.',
      })
      expect(res).toEqual(['contato@acme.com'])
    })

    it('deduplica candidatos (case-insensitive)', () => {
      const res = extractEmailsFromRawJson({
        email: 'contato@acme.com',
        nested: { contactEmail: 'Contato@Acme.com' },
      })
      expect(res).toEqual(['contato@acme.com'])
    })
  })

  describe('extractEmailsFromRawJson — denylist de chaves pessoais/sensiveis', () => {
    it('owner.email e personal_email NAO viram candidatos', () => {
      const res = extractEmailsFromRawJson({
        owner: { email: 'dono@acme.com' },
        personal_email: 'pessoa@acme.com',
        email: 'contato@acme.com',
      })
      expect(res).toEqual(['contato@acme.com'])
    })

    it('subarvore inteira sob chave denylisted nao e percorrida', () => {
      const res = extractEmailsFromRawJson({
        owner: { contact: { deep: { email: 'dono@acme.com' } } },
        private_data: { emails: ['secreto@acme.com'] },
      })
      expect(res).toEqual([])
    })

    it('chaves de credencial (token, authorization, cookie) sao ignoradas', () => {
      const res = extractEmailsFromRawJson({
        access_token: 'bearer vazou@acme.com',
        headers: { authorization: 'Basic dono@acme.com', cookie: 'session=x sac@acme.com' },
      })
      expect(res).toEqual([])
    })

    it('denylist e case-insensitive e por substring', () => {
      const res = extractEmailsFromRawJson({
        OwnerInfo: { email: 'dono@acme.com' },
        clientSecretEmail: 'secreto@acme.com',
        email: 'contato@acme.com',
      })
      expect(res).toEqual(['contato@acme.com'])
    })

    it('payload pt-BR (R2-2): proprietario.email_pessoal NAO vira candidato — subarvore nao e percorrida', () => {
      const res = extractEmailsFromRawJson({
        proprietario: { email_pessoal: 'joao@gmail.com' },
        dono: { email: 'dono@gmail.com' },
        responsavel_email: 'resp@gmail.com',
        celular_pessoal: 'fale comigo em pessoal@gmail.com',
        data_nascimento: 'nasci@gmail.com',
        email: 'contato@empresa.com.br',
      })
      expect(res).toEqual(['contato@empresa.com.br'])
    })

    it('tokens pt-BR casam com diacriticos (proprietário/sócio) e maiusculas', () => {
      const res = extractEmailsFromRawJson({
        ['Proprietário']: { email: 'dono@gmail.com' },
        ['sócio']: { email: 'socio@gmail.com' },
        Titular: 'titular@gmail.com',
        email: 'contato@empresa.com.br',
      })
      expect(res).toEqual(['contato@empresa.com.br'])
    })
  })

  describe('extractEmailsFromRawJson — limites HARD', () => {
    it('respeita profundidade maxima (email fundo demais nao e coletado)', () => {
      let fundo: Record<string, unknown> = { email: 'fundo@acme.com' }
      for (let i = 0; i < 7; i += 1) fundo = { wrap: fundo }
      expect(extractEmailsFromRawJson(fundo)).toEqual([])

      let raso: Record<string, unknown> = { email: 'raso@acme.com' }
      for (let i = 0; i < 4; i += 1) raso = { wrap: raso }
      expect(extractEmailsFromRawJson(raso)).toEqual(['raso@acme.com'])
    })

    it('respeita o limite de nos visitados', () => {
      const grande: Record<string, unknown> = {}
      for (let i = 0; i < 2100; i += 1) grande[`k${i}`] = 'sem email aqui'
      grande.email = 'tarde@acme.com'
      expect(extractEmailsFromRawJson(grande)).toEqual([])

      const pequeno: Record<string, unknown> = {}
      for (let i = 0; i < 50; i += 1) pequeno[`k${i}`] = 'sem email aqui'
      pequeno.email = 'cedo@acme.com'
      expect(extractEmailsFromRawJson(pequeno)).toEqual(['cedo@acme.com'])
    })

    it('analisa apenas os primeiros 10000 chars de strings longas', () => {
      const res = extractEmailsFromRawJson({
        siteHtml: `${'a'.repeat(10000)} longe@acme.com`,
      })
      expect(res).toEqual([])

      const ok = extractEmailsFromRawJson({
        siteHtml: `${'a'.repeat(100)} perto@acme.com`,
      })
      expect(ok).toEqual(['perto@acme.com'])
    })

    it('nunca lanca com referencia ciclica', () => {
      const ciclo: Record<string, unknown> = { email: 'ciclo@acme.com' }
      ciclo.self = ciclo
      ciclo.lista = [ciclo, { email: 'outro@acme.com' }]
      expect(() => extractEmailsFromRawJson(ciclo)).not.toThrow()
      expect(extractEmailsFromRawJson(ciclo)).toEqual(['ciclo@acme.com', 'outro@acme.com'])
    })
  })

  describe('extractEmailCandidatesFromHtml — fontes ampliadas', () => {
    it('mantem extracao de e-mail literal (regressao)', () => {
      const res = extractEmailCandidatesFromHtml('<p>Escreva para contato@acme.com.</p>')
      expect(res).toEqual(['contato@acme.com'])
    })

    it('extrai mailto: simples e corta a query ?subject=', () => {
      const html =
        '<a href="mailto:vendas@empresa.com.br?subject=Or%C3%A7amento&body=ola">fale conosco</a>'
      expect(extractEmailCandidatesFromHtml(html)).toEqual(['vendas@empresa.com.br'])
    })

    it('decodifica URI no mailto (%40 vira @)', () => {
      const html = '<a href="mailto:sac%40empresa.com.br">SAC</a>'
      expect(extractEmailCandidatesFromHtml(html)).toEqual(['sac@empresa.com.br'])
    })

    it('colhe chaves email de blocos JSON-LD, inclusive aninhadas', () => {
      const html = `
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"LocalBusiness",
           "email":"contato@empresa.com.br",
           "contactPoint":{"@type":"ContactPoint","email":"sac@empresa.com.br"}}
        </script>`
      const res = extractEmailCandidatesFromHtml(html)
      expect(res).toContain('contato@empresa.com.br')
      expect(res).toContain('sac@empresa.com.br')
    })

    it('JSON-LD invalido nao quebra nem impede as demais fontes', () => {
      const html = `
        <script type="application/ld+json">{isso nao e json}</script>
        <p>contato@acme.com</p>`
      expect(extractEmailCandidatesFromHtml(html)).toEqual(['contato@acme.com'])
    })

    it('JSON-LD respeita a denylist de chaves pessoais', () => {
      const html = `
        <script type="application/ld+json">
          {"owner":{"email":"dono@empresa.com.br"},"email":"contato@empresa.com.br"}
        </script>`
      const res = extractEmailCandidatesFromHtml(html)
      expect(res).toEqual(['contato@empresa.com.br'])
    })

    it('decodifica ofuscacao [at]/[dot] com espacos opcionais', () => {
      const res = extractEmailCandidatesFromHtml('contato [at] empresa [dot] com [dot] br')
      expect(res).toEqual(['contato@empresa.com.br'])
    })

    it('decodifica ofuscacao (at)/(dot) sem espacos', () => {
      expect(extractEmailCandidatesFromHtml('vendas(at)acme(dot)com')).toEqual(['vendas@acme.com'])
    })

    it('decodifica ofuscacao [arroba]', () => {
      expect(extractEmailCandidatesFromHtml('contato[arroba]empresa.com.br')).toEqual([
        'contato@empresa.com.br',
      ])
      expect(extractEmailCandidatesFromHtml('sac [arroba] empresa.com.br')).toEqual([
        'sac@empresa.com.br',
      ])
    })

    it('decodifica entidades HTML &#64; e &commat;', () => {
      expect(extractEmailCandidatesFromHtml('contato&#64;empresa.com.br')).toEqual([
        'contato@empresa.com.br',
      ])
      expect(extractEmailCandidatesFromHtml('sac&commat;acme.com')).toEqual(['sac@acme.com'])
    })

    it('retorna [] para entrada nula/vazia', () => {
      expect(extractEmailCandidatesFromHtml(null)).toEqual([])
      expect(extractEmailCandidatesFromHtml(undefined)).toEqual([])
      expect(extractEmailCandidatesFromHtml('')).toEqual([])
    })
  })

  describe('extractEmailCandidatesFromHtml — precisao (falsos positivos)', () => {
    it("'look at example.com' NAO produz e-mail (at sem delimitador)", () => {
      expect(extractEmailCandidatesFromHtml('look at example.com')).toEqual([])
    })

    it("'olhe (at) casa' NAO produz e-mail (sem dominio com TLD)", () => {
      expect(extractEmailCandidatesFromHtml('olhe (at) casa')).toEqual([])
    })

    it('assets retina continuam rejeitados na descoberta (regressao)', () => {
      const res = discoverEmails({
        html: '<img src="ajax-loader@2x.gif"><img srcset="logo@3x.png 3x">',
      })
      expect(res.primary).toBeNull()
      expect(res.secondary).toEqual([])
    })
  })

  describe('discoverEmails — priorizacao por dominio canonico', () => {
    it('caso QA do doc: canonical-pessoal vence external-generico', () => {
      const html = `
        <main>Atendimento direto: joao@empresa.com.br</main>
        <footer>Site criado por <a href="mailto:contato@plataforma.com">contato@plataforma.com</a></footer>`
      const res = discoverEmails({ html, websiteUrl: 'https://empresa.com.br' })
      expect(res.primary).toBe('joao@empresa.com.br')
      expect(res.primaryDomainClass).toBe('canonical')
      expect(res.secondary).toEqual(['contato@plataforma.com'])
    })

    it('canonical-generico vence canonical-pessoal', () => {
      const res = discoverEmails({
        extra: ['joao@empresa.com.br', 'contato@empresa.com.br'],
        websiteUrl: 'https://www.empresa.com.br',
      })
      expect(res.primary).toBe('contato@empresa.com.br')
      expect(res.primaryDomainClass).toBe('canonical')
    })

    it('ordena os quatro grupos: canon-gen > canon-pessoal > ext-gen > ext-pessoal', () => {
      const res = discoverEmails({
        extra: [
          'maria@gmail.com',
          'joao@empresa.com.br',
          'contato@plataforma.com',
          'vendas@empresa.com.br',
        ],
        websiteUrl: 'https://www.empresa.com.br',
      })
      expect(res.primary).toBe('vendas@empresa.com.br')
      expect(res.secondary).toEqual([
        'joao@empresa.com.br',
        'contato@plataforma.com',
        'maria@gmail.com',
      ])
      expect(res.primaryDomainClass).toBe('canonical')
    })

    it('subdominio do site canonico conta como canonical', () => {
      const res = discoverEmails({
        extra: ['contato@plataforma.com', 'ana@loja.empresa.com.br'],
        websiteUrl: 'https://empresa.com.br',
      })
      expect(res.primary).toBe('ana@loja.empresa.com.br')
      expect(res.primaryDomainClass).toBe('canonical')
    })

    it('so dominio externo: primary externo com primaryDomainClass external', () => {
      const res = discoverEmails({
        extra: ['contato@plataforma.com'],
        websiteUrl: 'https://empresa.com.br',
      })
      expect(res.primary).toBe('contato@plataforma.com')
      expect(res.primaryDomainClass).toBe('external')
    })
  })

  describe('discoverEmails — regressao sem websiteUrl', () => {
    it('mantem comportamento legado (generico vence pessoal) e classe unknown', () => {
      const res = discoverEmails({
        extra: ['joao@empresa.com.br', 'contato@plataforma.com'],
      })
      expect(res.primary).toBe('contato@plataforma.com')
      expect(res.secondary).toEqual(['joao@empresa.com.br'])
      expect(res.primaryDomainClass).toBe('unknown')
    })

    it('websiteUrl invalido cai no comportamento legado com classe unknown', () => {
      const res = discoverEmails({
        extra: ['joao@empresa.com.br', 'contato@plataforma.com'],
        websiteUrl: 'isso nao e uma url',
      })
      expect(res.primary).toBe('contato@plataforma.com')
      expect(res.primaryDomainClass).toBe('unknown')
    })

    it('sem candidatos: primary null e classe unknown mesmo com websiteUrl', () => {
      const res = discoverEmails({ websiteUrl: 'https://empresa.com.br' })
      expect(res.primary).toBeNull()
      expect(res.secondary).toEqual([])
      expect(res.primaryDomainClass).toBe('unknown')
    })

    it('acumula sources na ordem raw_json > site_html > extra', () => {
      const res = discoverEmails({
        rawJson: { email: 'contato@acme.com' },
        html: '<p>sac@acme.com</p>',
        extra: ['vendas@acme.com'],
      })
      expect(res.sources).toEqual(['raw_json', 'site_html', 'extra'])
      expect(res.primary).toBe('contato@acme.com')
    })
  })
})
