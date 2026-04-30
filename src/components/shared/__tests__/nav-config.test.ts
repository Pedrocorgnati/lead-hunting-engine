/**
 * TASK-MS4-T07 — Zero Routes Orphans (regressao)
 *
 * Garante que todo `href` declarado em APP_NAV_ITEMS / ADMIN_NAV_ITEMS aponta
 * para um arquivo `src/app{href}/page.tsx` existente. Este teste roda em CI e
 * impede que itens da sidebar fiquem orfaos quando alguem renomeia/remove rotas.
 *
 * Considera grupos de rota do Next.js — `(app)`, `(public)`, `(auth)` etc. — ao
 * resolver o caminho fisico no filesystem.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { APP_NAV_ITEMS, ADMIN_NAV_ITEMS } from '../nav-config'

const APP_DIR = join(__dirname, '..', '..', '..', 'app')
const ROUTE_GROUPS = ['(app)', '(public)', '(auth)']

function resolvePageFile(href: string): string | null {
  const segments = href.split('/').filter(Boolean)

  // 1) caminho direto
  const direct = join(APP_DIR, ...segments, 'page.tsx')
  if (existsSync(direct)) return direct

  // 2) tenta dentro de cada grupo de rota
  for (const group of ROUTE_GROUPS) {
    const grouped = join(APP_DIR, group, ...segments, 'page.tsx')
    if (existsSync(grouped)) return grouped
  }

  return null
}

describe('nav-config — Zero Routes Orphans', () => {
  test.each(APP_NAV_ITEMS.map((item) => [item.href, item.label]))(
    'APP_NAV item "%s" (%s) tem page.tsx existente',
    (href) => {
      const file = resolvePageFile(href)
      expect(file).not.toBeNull()
    }
  )

  test.each(ADMIN_NAV_ITEMS.map((item) => [item.href, item.label]))(
    'ADMIN_NAV item "%s" (%s) tem page.tsx existente',
    (href) => {
      const file = resolvePageFile(href)
      expect(file).not.toBeNull()
    }
  )

  it('APP_NAV_ITEMS nao tem hrefs duplicados', () => {
    const hrefs = APP_NAV_ITEMS.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('ADMIN_NAV_ITEMS nao tem hrefs duplicados', () => {
    const hrefs = ADMIN_NAV_ITEMS.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('hrefs de APP e ADMIN nao se sobrepoem', () => {
    const app = new Set(APP_NAV_ITEMS.map((i) => i.href))
    const admin = ADMIN_NAV_ITEMS.map((i) => i.href)
    for (const href of admin) {
      expect(app.has(href)).toBe(false)
    }
  })
})
